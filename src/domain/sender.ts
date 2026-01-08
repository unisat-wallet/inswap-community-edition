import { CommitOp } from "../types/op";
import { getConfirmedNum, need, satsToBtc, sysFatal } from "./utils";

import { Wallet, bitcoin, printPsbt } from "../lib/bitcoin";
import { generateCommitTxs } from "../lib/tx-helpers/commit-helper";
import { UTXO } from "../types/api";
import { loggerError } from "../utils/utils";
import { MAX_OP_SIZE, TX_CONFIRM_NUM, UNCONFIRM_HEIGHT } from "./constant";
import { CodeEnum, internal_server_error } from "./error";

const TAG = "sender";

export class Sender {
  private commiting = false;
  private lastHandledHeight = 0;
  private commitFailCount = 0;
  private fatalCount = 0;

  get CommitFailCount() {
    return this.commitFailCount;
  }

  get Committing() {
    return this.commiting;
  }

  constructor() {}

  async init() {}

  async pushCommitOp(op: CommitOp) {
    console.log("commit begin, parent: " + op.parent);

    this.commiting = true;
    let fatalError = false;
    try {
      need(op.parent == operator.NewestCommitData.op.parent);

      const res = await sequencerTxDao.find({
        parent: op.parent,
      });
      if (res.length) {
        sysFatal({ tag: TAG, msg: "repeated parent op", parent: op.parent });
      }

      const opSize = JSON.stringify(op).length;
      if (opSize > MAX_OP_SIZE) {
        sysFatal({ tag: TAG, msg: "opSize too big", parent: op.parent });
      }

      let feeRate = Math.max(config.minFeeRate, env.FeeRate);
      feeRate = feeRate * config.commitFeeRateRatio;
      need(!!feeRate, internal_server_error, CodeEnum.internal_api_error);

      const utxoA = (
        await sequencerUtxoDao.find(
          {
            status: "confirmed",
            used: "unused",
            purpose: "inscribe",
          },
          { sort: { satoshi: -1 } }
        )
      )[0];
      logger.info({ tag: TAG, msg: "utxoA", utxoA });

      need(!!utxoA, "utxoA not enough", CodeEnum.sequencer_insufficient_funds);

      const utxoB = (
        await sequencerUtxoDao.find(
          {
            status: "confirmed",
            used: "unused",
            purpose: "activate",
          },
          { sort: { satoshi: -1 } }
        )
      )[0];
      logger.info({ tag: TAG, msg: "utxoB", utxoB });

      need(!!utxoB, "utxoB not enough", CodeEnum.sequencer_insufficient_funds);

      const utxoCRes = await sequencerUtxoDao.find({
        used: "unused",
        purpose: "sequence",
      });
      if (utxoCRes.length > 1) {
        sysFatal({ tag: TAG, msg: "utxoC num error", num: utxoCRes.length });
      }
      const utxoC = utxoCRes[0];
      logger.info({ tag: TAG, msg: "utxoC", utxoC });

      need(!!utxoC, "utxoC not enough", CodeEnum.sequencer_insufficient_funds);

      let btcUtxosA: UTXO[] = [utxoA];
      let btcUtxosB: UTXO[] = [utxoB];
      let sequencerWallet: Wallet = keyring.sequencerWallet;
      let inscribeWallet: Wallet = keyring.deriveFromRootWallet(
        sequencerWallet.address,
        "inscribe"
      );
      let btcWallet: Wallet = keyring.btcWallet;
      let seqWallet: Wallet = keyring.btcWallet;
      let seqUtxo: UTXO = utxoC;

      logger.info({
        tag: TAG,
        msg: "commit-txs",
        parent: op.parent,
        feeRate,
        utxoA,
        utxoB,
        utxoC,
      });

      const commitResult = generateCommitTxs({
        op,
        sequencerWallet,
        inscribeWallet,
        btcWallet,
        btcUtxosA,
        btcUtxosB,
        seqWallet,
        seqUtxo,
        feeRate,
      });
      await sequencerUtxoDao.updateOne(
        {
          txid: utxoA.txid,
          vout: utxoA.vout,
        },
        {
          $set: {
            used: "locked",
            parent: op.parent,
          },
        }
      );
      await sequencerUtxoDao.updateOne(
        {
          txid: utxoB.txid,
          vout: utxoB.vout,
        },
        {
          $set: {
            used: "locked",
            parent: op.parent,
          },
        }
      );

      await sequencerUtxoDao.updateOne(
        {
          txid: utxoC.txid,
          vout: utxoC.vout,
        },
        {
          $set: {
            used: "locked",
            parent: op.parent,
          },
        }
      );

      await sequencerUtxoDao.insert(
        Object.assign(commitResult.nextBtcUtxoA, {
          used: "unused",
          status: "unconfirmed",
          purpose: "inscribe",
          parent: op.parent,
        }) as any
      );

      await sequencerUtxoDao.insert(
        Object.assign(commitResult.nextBtcUtxoB, {
          used: "unused",
          status: "unconfirmed",
          purpose: "activate",
          parent: op.parent,
        }) as any
      );

      await sequencerUtxoDao.insert(
        Object.assign(commitResult.nextSeqUtxo, {
          used: "unused",
          status: "unconfirmed",
          purpose: "sequence",
          parent: op.parent,
        }) as any
      );

      const psbt1 = bitcoin.Psbt.fromHex(commitResult.tx1.psbtHex, { network });
      commitResult.tx1.toSignInputs.forEach((v) => {
        btcWallet.signPsbtInput(psbt1, v.index);
      });
      psbt1.finalizeAllInputs();
      printPsbt(psbt1);

      let psbt2 = bitcoin.Psbt.fromHex(commitResult.tx2.psbtHex, { network });
      let psbt3 = bitcoin.Psbt.fromHex(commitResult.tx3.psbtHex, { network });

      if (sequencerWallet.isWatchOnly()) {
        commitResult.tx3.toSignInputs.forEach((v) => {
          if (v.address === seqWallet.address) {
            seqWallet.signPsbtInput(psbt3, v.index);
          } else if (v.address === btcWallet.address) {
            btcWallet.signPsbtInput(psbt3, v.index);
          }
        });
        const newPsbtHex = await keyring.signPsbtBySequencerWallet(
          psbt3.toHex(),
          commitResult.tx3.toSignInputs.filter(
            (v) => v.address === sequencerWallet.address
          )
        );
        psbt3 = bitcoin.Psbt.fromHex(newPsbtHex, { network });
      } else {
        commitResult.tx3.toSignInputs.forEach((v) => {
          if (v.address === sequencerWallet.address) {
            sequencerWallet.signPsbtInput(psbt3, v.index);
          } else if (v.address === seqWallet.address) {
            seqWallet.signPsbtInput(psbt3, v.index);
          } else if (v.address === btcWallet.address) {
            btcWallet.signPsbtInput(psbt3, v.index);
          }
        });
      }

      psbt3.finalizeAllInputs();
      printPsbt(psbt3);

      const txs = [
        {
          txid: commitResult.tx1.txid,
          rawtx: psbt1.extractTransaction(true).toHex(),
          fee: psbt1.getFee(),
        },
        {
          txid: commitResult.tx2.txid,
          rawtx: commitResult.tx2.rawtx,
          fee: psbt2.getFee(),
        },
        {
          txid: commitResult.tx3.txid,
          rawtx: psbt3.extractTransaction(true).toHex(),
          fee: psbt3.getFee(),
        },
      ];

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        let success = true;

        try {
          await api.broadcast(tx.rawtx);
        } catch (err) {
          success = false;
          if (
            err.message.includes("conflict") ||
            err.message.includes("missing")
          ) {
            this.fatalCount++;
            if (this.fatalCount > 3) {
              fatalError = true;
            }
            logger.error({
              tag: TAG,
              msg: "commit-tx-broadcast-fatal",
              txid: tx.txid,
              error: err.message,
            });
          } else {
            this.fatalCount = 0;
          }
        }
        await sequencerTxDao.insert({
          inscriptionId: commitResult.inscriptionId,
          txid: tx.txid,
          rawtx: tx.rawtx,
          status: success ? "unconfirmed" : "pending",
          height: 0,
          feeRate,
          fee: tx.fee,
          parent: op.parent,
          timestamp: Date.now(),
        });
      }

      if (fatalError) {
        this.commitFailCount++;
        let unusedA = false;
        let unusedB = false;
        let unusedC = false;
        try {
          const res = await api.utxo(utxoA.txid, utxoA.vout);
          if (res) {
            unusedA = true;
          }
        } catch (err) {}
        try {
          const res = await api.utxo(utxoB.txid, utxoB.vout);
          if (res) {
            unusedB = true;
          }
        } catch (err) {}
        try {
          const res = await api.utxo(utxoB.txid, utxoB.vout);
          if (res) {
            unusedB = true;
          }
        } catch (err) {}
        sysFatal({
          tag: TAG,
          msg: "tx-fatal",
          utxoA,
          utxoB,
          utxoC,
          unusedA,
          unusedB,
          unusedC,
        });
      }

      await opCommitDao.upsertByParent(op.parent, {
        inscriptionId: commitResult.inscriptionId,
        txid: commitResult.tx3.txid,
      });
      operator.NewestCommitData.inscriptionId = commitResult.inscriptionId;

      this.commitFailCount = 0;
    } finally {
      this.commiting = false;
    }
    console.log("commit end");
  }

  async updateSequencerDao() {
    const blockHeight = await api.bestHeight();
    if (blockHeight !== this.lastHandledHeight) {
      this.lastHandledHeight = blockHeight;
      logger.debug({ tag: TAG, msg: "update-sequencer", height: blockHeight });

      // update sequencer utxo status
      // unconfrimed -> confirmed
      const utxos = await sequencerUtxoDao.find({
        status: "unconfirmed",
      });
      for (let i = 0; i < utxos.length; i++) {
        const utxo = utxos[i];
        try {
          logger.debug({
            tag: TAG,
            msg: "check-utxo",
            txid: utxo.txid,
            vout: utxo.vout,
          });
          const txInfo = await api.txInfo(utxo.txid);
          if (getConfirmedNum(txInfo.height) > 0) {
            await sequencerUtxoDao.updateOne(
              { txid: utxo.txid, vout: utxo.vout },
              { $set: { status: "confirmed" } }
            );
          } else {
            //
          }
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "commit-utxo-check",
            txid: utxo.txid,
            vout: utxo.vout,
            error: err.message,
          });
        }
      }

      // update commit txs status
      // pending -> unconfirmed
      let txs = await sequencerTxDao.find({
        status: { $in: ["pending"] },
      });
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        try {
          await api.broadcast(tx.rawtx);
          await sequencerTxDao.updateOne(
            { txid: tx.txid },
            { $set: { status: "unconfirmed" } }
          );
        } catch (err) {
          if (err.message == "Transaction already in block chain") {
            await sequencerTxDao.updateOne(
              { txid: tx.txid },
              {
                $set: {
                  status: "unconfirmed",
                  height: UNCONFIRM_HEIGHT,
                },
              }
            );
          } else {
            logger.error({
              tag: TAG,
              msg: "commit-tx-broadcast",
              txid: tx.txid,
              error: err.message,
            });
          }
        }
      }

      // update commit txs status
      // unconfirmed -> confirmed
      txs = await sequencerTxDao.find({ status: "unconfirmed" });
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        try {
          const info = await api.txInfo(tx.txid);
          if (info && getConfirmedNum(info.height) > TX_CONFIRM_NUM) {
            await sequencerTxDao.updateOne(
              { txid: tx.txid },
              {
                $set: {
                  status: "confirmed",
                  height: info.height,
                },
              }
            );
          }
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "commit-tx-confirm",
            txid: tx.txid,
            error: err.message,
          });
        }
      }
    }
  }

  async updateMetric() {
    const A = await sequencerUtxoDao.find(
      {
        status: "confirmed",
        used: "unused",
        purpose: "inscribe",
      },
      { sort: { satoshi: -1 } }
    );
    const B = await sequencerUtxoDao.find(
      {
        status: "confirmed",
        used: "unused",
        purpose: "activate",
      },
      { sort: { satoshi: -1 } }
    );
    metric.nextUtxoA.set(satsToBtc(A[0] ? A[0].satoshi : 0));
    metric.nextUtxoB.set(satsToBtc(B[0] ? B[0].satoshi : 0));
    metric.estimatedCostUtxoB.set(satsToBtc(env.FeeRate * 320));
    const opSize = JSON.stringify(operator.NewestCommitData.op).length;
    metric.estimatedCostUtxoA.set(
      satsToBtc((153 + 109 + opSize / 4) * env.FeeRate)
    );

    let res = await sequencerUtxoDao.find({
      status: "confirmed",
      used: "unused",
    });
    let total = 0;
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      total += item.satoshi;
    }
    metric.totalUtxoBalance.set(satsToBtc(total));

    const res2 = await sequencerTxDao.find({});
    total = 0;
    for (let i = 0; i < res2.length; i++) {
      const item = res2[i];
      if (item.fee) {
        total += item.fee;
      }
    }
    metric.costUtxoBalance.set(satsToBtc(total));
  }

  async tick() {
    try {
      await this.updateSequencerDao();
      await this.updateMetric();
    } catch (err) {
      loggerError("sender-tick", err);
    }
  }
}
