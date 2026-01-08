import { Psbt } from "bitcoinjs-lib";
import {
  ConfirmDirectWithdrawReq,
  ConfirmRetryWithdrawReq,
  ConfirmRetryWithdrawRes,
  ConfirmWithdrawRes,
  CreateDirectWithdrawReq,
  CreateDirectWithdrawRes,
  CreateRetryWithdrawReq,
  CreateRetryWithdrawRes,
  FuncReq,
} from "../types/route";

import { Mutex } from "async-mutex";
import { bn } from "../contract/bn";
import { WithdrawData } from "../dao/withdraw-dao";
import { bitcoin, toXOnly, Wallet } from "../lib/bitcoin";
import {
  estimateWithdrawFee,
  generateDirectWithdrawTxs,
} from "../lib/tx-helpers/withdraw-helper";
import { UTXO } from "../types/api";
import { FuncType } from "../types/func";
import { isNetWorkError, queue } from "../utils/utils";
import { UNCONFIRM_HEIGHT } from "./constant";
import {
  CodeEnum,
  CodeError,
  expired_data,
  insufficient_balance,
  insufficient_btc,
  insufficient_confirmed_btc,
  params_error,
  paramsMissing,
  withdraw_limit,
} from "./error";
import {
  checkAddressType,
  checkAmount,
  filterDustUTXO,
  filterUnconfirmedUTXO,
  getConfirmedNum,
  need,
  validator,
} from "./utils";

const TestFail = false;
const TAG = "withdraw";

export class DirectWithdraw {
  private lastCheckHeight: number;

  // id --> data
  private orderIdMap: { [key: string]: WithdrawData } = {};
  private approveIdMap: { [key: string]: WithdrawData } = {};
  private tmp: { [key: string]: WithdrawData } = {};

  private mutex = new Mutex();

  async update(data: WithdrawData) {
    this.orderIdMap[data.id] = data;
    this.approveIdMap[data.inscriptionId] = data;
    await withdrawDao.upsertData(data);
  }

  getByOrderId(id: string) {
    return this.orderIdMap[id];
  }

  getByApproveId(approveId: string) {
    return this.approveIdMap[approveId];
  }

  getAllOrder() {
    const ret: WithdrawData[] = [];
    for (const key in this.orderIdMap) {
      if (this.orderIdMap[key].status == "order") {
        ret.push(this.orderIdMap[key]);
      }
    }
    return ret;
  }

  async init() {
    this.lastCheckHeight = env.BestHeight - 1;

    const res = await withdrawDao.find({ type: "direct" });
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      this.orderIdMap[item.id] = item;
      this.approveIdMap[item.inscriptionId] = item;
    }
  }

  async tick() {
    if (env.BestHeight == this.lastCheckHeight) {
      return;
    }

    for (const id in this.orderIdMap) {
      // TODO: more check exception

      const withdraw = this.orderIdMap[id];
      if (
        withdraw.status !== "pendingOrder" &&
        withdraw.status !== "pendingCancel"
      ) {
        continue;
      }

      try {
        if (withdraw.status == "pendingOrder") {
          logger.debug({
            tag: TAG,
            msg: "check-pendingOrder",
            id: withdraw.id,
          });
          // wait for pending rollup confirm
          if (!withdraw.rollUpTxid) {
            const res = await opCommitDao.findByParent(withdraw.commitParent);
            need(!!res);

            const rollUpTxid = res.txid;
            if (rollUpTxid) {
              let info;
              try {
                info = await api.txInfo(rollUpTxid);
              } catch (err) {
                continue;
              }
              if (getConfirmedNum(info.height) >= config.pendingRollupNum) {
                if (withdraw.testFail) {
                  throw new Error("test fail");
                }

                // handle inscribe and approve
                console.log("handle withdraw, broadcast id: ", withdraw.id);
                const { signedInscribePsbt, signedApprovePsbt } = withdraw;
                const inscribePsbtObj = Psbt.fromHex(signedInscribePsbt, {
                  network,
                });
                // done
                // inscribePsbtObj.validateSignaturesOfAllInputs(validator);
                // inscribePsbtObj.finalizeAllInputs();
                const inscribeTx = inscribePsbtObj.extractTransaction(true);
                const inscribeTxid = inscribeTx.getId();
                await api.broadcast(inscribeTx.toHex());

                const signedApprovePsbtObj = Psbt.fromHex(signedApprovePsbt, {
                  network,
                });
                signedApprovePsbtObj.validateSignaturesOfAllInputs(validator);
                signedApprovePsbtObj.finalizeAllInputs();
                const approveTx = signedApprovePsbtObj.extractTransaction(true);
                const approveTxid = approveTx.getId();
                await api.broadcast(approveTx.toHex());

                withdraw.rollUpHeight = info.height;
                withdraw.rollUpTxid = rollUpTxid;
                withdraw.inscribeTxid = inscribeTxid;
                withdraw.approveTxid = approveTxid;

                await this.update(withdraw);
              }
            }
          } else {
            if (withdraw.testFail) {
              throw new Error("test fail");
            }
            const info = await api.txInfo(withdraw.approveTxid);
            if (info.height !== UNCONFIRM_HEIGHT) {
              withdraw.approveHeight = info.height;
              await this.update(withdraw);
            }

            if (
              config.pendingWithdrawNum == 0 ||
              getConfirmedNum(info.height) >= config.pendingWithdrawNum
            ) {
              withdraw.status = "completed";
              withdraw.failCount = 0;
              await this.update(withdraw);
            }
          }
        } else if (withdraw.status == "pendingCancel") {
          const info = await api.txInfo(withdraw.approveTxid);
          if (info.height !== UNCONFIRM_HEIGHT) {
            withdraw.cancelHeight = info.height;
            await this.update(withdraw);
          }
          if (
            config.pendingWithdrawNum == 0 ||
            getConfirmedNum(info.height) >= config.pendingWithdrawNum
          ) {
            withdraw.status = "cancel";
            await this.update(withdraw);
          }
        }
      } catch (err) {
        if (!isNetWorkError(err)) {
          if (err.message !== "get tx failed") {
            withdraw.status = "error";
            withdraw.errMsg = err.message;
          } else {
            // timeout
            if (Date.now() / 1000 - withdraw.ts > 3600 * 12) {
              if (!withdraw.failCount) {
                withdraw.failCount = 1;
              } else {
                withdraw.failCount++;
              }

              // 10 minues
              if (withdraw.failCount > 200) {
                withdraw.status = "error";
                withdraw.errMsg = err.message;
              }
            }
          }
          await this.update(withdraw);
        }
        logger.error({
          tag: TAG,
          id: withdraw.id,
          msg: "withdraw-error",
          error: err.message,
          stack: err.stack,
          address: withdraw.address,
          inscriptionId: withdraw.inscriptionId,
          paymentTxid: withdraw.paymentTxid,
          inscribeTxid: withdraw.inscribeTxid,
          approveTxid: withdraw.approveTxid,
        });
      }
    }
    this.lastCheckHeight = env.BestHeight;
  }

  async create(req: CreateDirectWithdrawReq): Promise<CreateDirectWithdrawRes> {
    return await queue(this.mutex, async () => {
      const {
        address,
        tick,
        amount,
        pubkey,
        ts,
        feeTick,
        payType,
        assetType,
        networkType,
      } = req;

      checkAddressType(address);
      checkAmount(amount, decimal.get(tick));

      const params: FuncReq = {
        func: FuncType.decreaseApproval,
        req: {
          address,
          tick,
          amount,
          ts,
          feeTick,
          payType,
        },
      };
      const res = await operator.genPreRes(params, null, true);
      const userWallet = Wallet.fromAddress(address, pubkey);
      const utxos = filterUnconfirmedUTXO(
        filterDustUTXO(await api.addressUTXOs(address))
      ).sort((a, b) => {
        return b.satoshi - a.satoshi;
      });

      const op = {
        p: "brc20-module",
        op: "withdraw",
        tick: req.tick,
        amt: req.amount,
        module: config.moduleId,
      };
      const feeRate = env.FeeRate;

      const _utxos: UTXO[] = [];
      let enough = false;
      for (let i = 0; i < utxos.length; i++) {
        _utxos.push(utxos[i]);
        const totalInput = _utxos.reduce((pre, cur) => {
          return pre + cur.satoshi;
        }, 0);
        const fee = estimateWithdrawFee({
          op,
          utxos: _utxos,
          feeRate,
          userWallet,
        });
        if (totalInput > fee) {
          enough = true;
          break;
        }
      }
      need(
        enough,
        insufficient_confirmed_btc,
        CodeEnum.user_insufficient_funds
      );

      const inscribeWallet = keyring.deriveFromRootWallet(address, "inscribe");
      const senderWallet = keyring.deriveFromRootWallet(address, "sender");
      const _withdraw = generateDirectWithdrawTxs({
        op,
        inscribeWallet,
        userWallet,
        feeRate,
        senderWallet,
        userUtxos: _utxos,
      });

      need(
        !this.getByApproveId(_withdraw.inscriptionId),
        expired_data,
        CodeEnum.internal_api_error
      );

      const psbt3 = bitcoin.Psbt.fromHex(_withdraw.tx3.psbtHex, { network });
      senderWallet.signPsbtInputs(psbt3, _withdraw.tx3.toSignInputs);

      const paymentPsbt = _withdraw.tx1.psbtHex;
      const signedInscribePsbt = _withdraw.tx2.psbtHex;
      const approvePsbt = psbt3.toHex();
      const inscriptionId = _withdraw.inscriptionId;
      const networkFee = _withdraw.payAmount;

      let limit = config.whitelistTick[tick]?.withdrawLimit || "0";
      if (!config.openWhitelistTick) {
        limit = "0";
      }
      need(bn(amount).gte(limit), `${withdraw_limit}: ${limit}`);

      const approvePsbtSignIndexes: number[] = [];
      _withdraw.tx3.toSignInputs.forEach((item) => {
        if (item.address == req.address) {
          approvePsbtSignIndexes.push(item.index);
        }
      });
      const ret: CreateDirectWithdrawRes = {
        id: res.ids[0],
        paymentPsbt,
        approvePsbt,
        approvePsbtSignIndexes,
        networkFee,
        assetType,
        networkType,
        originTick: tick,
        ...res,
      };
      const withdraw: WithdrawData = {
        rollUpHeight: UNCONFIRM_HEIGHT,
        approveHeight: UNCONFIRM_HEIGHT,
        cancelHeight: UNCONFIRM_HEIGHT,
        pubkey,
        address,
        inscriptionId,
        signedInscribePsbt,
        status: "pendingOrder",
        tick,
        amount,
        ts,
        commitParent: operator.NewestCommitData.op.parent,
        op: JSON.stringify(op),
        testFail: TestFail,
        type: "direct",
        ...ret,
      };

      this.tmp[withdraw.id] = withdraw;

      return ret;
    });
  }

  async confirm(req: ConfirmDirectWithdrawReq): Promise<ConfirmWithdrawRes> {
    return await queue(this.mutex, async () => {
      let { approvePsbt } = req;
      const {
        id,
        feeTick,
        feeAmount,
        feeTickPrice,
        sigs,
        paymentPsbt,
        payType,
      } = req;
      const withdraw = this.tmp[id];
      try {
        need(!!withdraw, expired_data);
        need(withdraw.status == "pendingOrder");
        need(
          withdraw.commitParent == operator.NewestCommitData.op.parent,
          expired_data
        );
        need(
          !this.getByApproveId(withdraw.inscriptionId),
          expired_data,
          CodeEnum.internal_api_error
        );
        need(withdraw.feeAmount == feeAmount, paramsMissing("feeAmount"));
        need(withdraw.feeTick == feeTick, paramsMissing("feeTick"));
        need(
          withdraw.feeTickPrice == feeTickPrice,
          paramsMissing("feeTickPrice")
        );
        need(withdraw.signMsgs.length == sigs.length, params_error);

        const { address, tick, amount, ts } = withdraw;
        checkAmount(amount, decimal.get(tick));

        // payment
        const paymentPsbtObj = Psbt.fromHex(paymentPsbt, { network });
        paymentPsbtObj.validateSignaturesOfAllInputs(validator);
        paymentPsbtObj.finalizeAllInputs();
        const paymentTx = paymentPsbtObj.extractTransaction(true);
        const paymentTxid = paymentTx.getId();

        // test fail
        const approvePsbtObj = Psbt.fromHex(approvePsbt, { network });

        // fix UniSat Wallet 1.5.7 bug
        const approveSenderInput = approvePsbtObj.data.inputs[1];
        if (
          approveSenderInput &&
          approveSenderInput.tapKeySig &&
          !approveSenderInput.tapInternalKey
        ) {
          const senderWallet = keyring.deriveFromRootWallet(address, "sender");
          approveSenderInput.tapInternalKey = toXOnly(senderWallet.publicKey);
          approvePsbt = approvePsbtObj.toHex();
        }
        approvePsbtObj.validateSignaturesOfAllInputs(validator);
        approvePsbtObj.finalizeAllInputs();

        const req: FuncReq = {
          func: FuncType.decreaseApproval,
          req: {
            address,
            tick,
            amount,
            ts,
            feeTick,
            feeAmount,
            feeTickPrice,
            sigs,
            payType,
          },
        };

        // test to pass
        await operator.aggregate(req, true, true);

        // payment broadcast
        await api.broadcast(paymentTx.toHex());

        // rollup
        await operator.aggregate(req, false, true);

        withdraw.signedApprovePsbt = approvePsbt;
        withdraw.signedPaymentPsbt = paymentPsbt;
        withdraw.paymentTxid = paymentTxid;
        withdraw.commitParent = operator.NewestCommitData.op.parent;
        withdraw.status = "pendingOrder";

        await this.update(withdraw);
        delete this.tmp[id];
      } catch (err) {
        if (err.message.includes(insufficient_balance)) {
          throw new CodeError(err.message, CodeEnum.user_insufficient_funds);
        } else {
          throw err;
        }

        // not delete tmp data
      }

      return {};
    });
  }

  async createRetry(
    req: CreateRetryWithdrawReq
  ): Promise<CreateRetryWithdrawRes> {
    return await queue(this.mutex, async () => {
      const { address, pubkey, id } = req;

      const oldWithdraw = this.getByOrderId(id);
      need(oldWithdraw.address == address, "Address error");
      need(oldWithdraw.pubkey == pubkey, "Pubkey error");

      const userWallet = Wallet.fromAddress(address, pubkey);
      let utxos = filterUnconfirmedUTXO(
        filterDustUTXO(await api.addressUTXOs(address))
      );
      utxos = utxos.sort((a, b) => {
        return b.satoshi - a.satoshi;
      });

      const feeRate = env.FeeRate;
      const op = JSON.parse(oldWithdraw.op);

      const _utxos: UTXO[] = [];
      let enough = false;
      for (let i = 0; i < utxos.length; i++) {
        _utxos.push(utxos[i]);
        const totalInput = _utxos.reduce((pre, cur) => {
          return pre + cur.satoshi;
        }, 0);
        const fee = estimateWithdrawFee({
          op,
          utxos: _utxos,
          feeRate,
          userWallet,
        });
        if (totalInput > fee) {
          enough = true;
          break;
        }
      }
      need(enough, insufficient_btc, CodeEnum.user_insufficient_funds);

      const inscribeWallet = keyring.deriveFromRootWallet(address, "inscribe");
      const senderWallet = keyring.deriveFromRootWallet(address, "sender");
      const _withdraw = generateDirectWithdrawTxs({
        op,
        inscribeWallet,
        userWallet,
        feeRate,
        senderWallet,
        userUtxos: _utxos,
      });

      const psbt3 = bitcoin.Psbt.fromHex(_withdraw.tx3.psbtHex, { network });
      senderWallet.signPsbtInputs(psbt3, _withdraw.tx3.toSignInputs);

      const paymentPsbt = _withdraw.tx1.psbtHex;
      const signedInscribePsbt = _withdraw.tx2.psbtHex;
      const approvePsbt = psbt3.toHex();
      const inscriptionId = _withdraw.inscriptionId;
      const networkFee = _withdraw.payAmount;

      const ret: CreateRetryWithdrawRes = {
        paymentPsbt,
        approvePsbt,
        networkFee,
      };

      const withdraw: WithdrawData = {
        rollUpHeight: UNCONFIRM_HEIGHT,
        approveHeight: UNCONFIRM_HEIGHT,
        cancelHeight: UNCONFIRM_HEIGHT,
        pubkey,
        address,
        inscriptionId,
        signedInscribePsbt,
        status: "pendingOrder",
        tick: oldWithdraw.tick,
        amount: oldWithdraw.amount,
        ts: oldWithdraw.ts,
        commitParent: oldWithdraw.commitParent,
        op: JSON.stringify(op),
        id,
        paymentPsbt,
        approvePsbt,
        networkFee,

        type: "direct",
        ...ret,
      } as any;

      this.tmp[withdraw.id] = withdraw;

      return ret;
    });
  }

  async confirmRetry(
    req: ConfirmRetryWithdrawReq
  ): Promise<ConfirmRetryWithdrawRes> {
    return await queue(this.mutex, async () => {
      const { id, paymentPsbt, approvePsbt } = req;
      const withdraw = this.tmp[id];
      try {
        need(!!withdraw);
        need(withdraw.status == "pendingOrder");
        need(withdraw.id == id);

        const { tick, amount } = withdraw;
        checkAmount(amount, decimal.get(tick));

        // payment
        const paymentPsbtObj = Psbt.fromHex(paymentPsbt, { network });
        paymentPsbtObj.validateSignaturesOfAllInputs(validator);
        paymentPsbtObj.finalizeAllInputs();
        const paymentTx = paymentPsbtObj.extractTransaction(true);
        const paymentTxid = paymentTx.getId();

        // test fail
        const approvePsbtObj = Psbt.fromHex(approvePsbt, { network });
        approvePsbtObj.validateSignaturesOfAllInputs(validator);
        approvePsbtObj.finalizeAllInputs();

        // payment broadcast
        await api.broadcast(paymentTx.toHex());

        withdraw.signedApprovePsbt = approvePsbt;
        withdraw.signedPaymentPsbt = paymentPsbt;
        withdraw.paymentTxid = paymentTxid;
        withdraw.status = "pendingOrder";

        // discard old withdraw
        const oldWithdraw = this.getByOrderId(id);
        // await withdrawDao.discardData(oldWithdraw); // TOFIX
        await this.update(withdraw);

        delete this.tmp[id];
      } catch (err) {
        if (err.message.includes(insufficient_balance)) {
          throw new CodeError(err.message, CodeEnum.user_insufficient_funds);
        } else {
          throw err;
        }
      }

      return {};
    });
  }
}
