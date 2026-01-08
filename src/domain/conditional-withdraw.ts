import { Psbt } from "bitcoinjs-lib";
import {
  ConfirmCancelWithdrawReq,
  ConfirmCancelWithdrawRes,
  ConfirmDirectWithdrawReq,
  ConfirmRetryWithdrawReq,
  ConfirmRetryWithdrawRes,
  ConfirmWithdrawRes,
  CreateCancelWithdrawReq,
  CreateCancelWithdrawRes,
  CreateConditionalWithdrawReq,
  CreateConditionalWithdrawRes,
  CreateRetryWithdrawReq,
  CreateRetryWithdrawRes,
  FuncReq,
} from "../types/route";

import { Mutex } from "async-mutex";
import { bn } from "../contract/bn";
import { WithdrawData } from "../dao/withdraw-dao";
import { Wallet, bitcoin } from "../lib/bitcoin";
import {
  estimateWithdrawFee,
  generateConditionalWithdrawTxs,
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
  utxo_not_enough,
  withdraw_limit,
} from "./error";
import {
  checkAddressType,
  checkAmount,
  filterDustUTXO,
  filterUnconfirmedUTXO,
  getConfirmedNum,
  getDust,
  getInputAmount,
  getMinUTXOs,
  getMixedPayment,
  need,
  utxoToInput,
  validator,
} from "./utils";
import { VPsbt } from "./vpsbt";

const TestFail = false;
const TAG = "conditional-withdraw";

export class ConditionalWithdraw {
  private lastCheckHeight: number;

  // id --> data
  private orderIdMap: { [key: string]: WithdrawData } = {};
  private approveIdMap: { [key: string]: WithdrawData } = {};
  private tmp: { [key: string]: WithdrawData } = {};

  private mutex = new Mutex();

  async update(data: WithdrawData) {
    this.orderIdMap[data.id] = data;
    this.approveIdMap[data.inscriptionId] = data;
    matching.updateByWithdraw(data);
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

    const res = await withdrawDao.find({ type: "conditional" });
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
              withdraw.status = "order";
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

  async create(
    req: CreateConditionalWithdrawReq
  ): Promise<CreateConditionalWithdrawRes> {
    return await queue(this.mutex, async () => {
      const { address, feeTick, tick, amount, pubkey, ts } = req;

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
        },
      };
      const res = await operator.genPreRes(params);
      const userWallet = Wallet.fromAddress(address, pubkey);
      const utxos = filterUnconfirmedUTXO(
        filterDustUTXO(await api.addressUTXOs(address))
      ).sort((a, b) => {
        return b.satoshi - a.satoshi;
      });

      const op = {
        p: "brc20-swap",
        op: "conditional-approve",
        tick: tick,
        amt: amount,
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
      need(enough, insufficient_btc, CodeEnum.user_insufficient_funds);

      const inscribeWallet = keyring.deriveFromRootWallet(address, "inscribe");
      const delegateWallet = keyring.getDelegateWallet(pubkey);
      const senderWallet = keyring.deriveFromRootWallet(address, "sender");
      const _withdraw = generateConditionalWithdrawTxs({
        op,
        inscribeWallet,
        userWallet,
        feeRate,
        senderWallet,
        userUtxos: _utxos,
        delegateWallet,
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

      const ret: CreateConditionalWithdrawRes = {
        id: res.ids[0],
        paymentPsbt,
        approvePsbt,
        networkFee,
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
        type: "conditional",
        ...ret,
      };

      this.tmp[withdraw.id] = withdraw;

      return ret;
    });
  }

  async confirm(req: ConfirmDirectWithdrawReq): Promise<ConfirmWithdrawRes> {
    return await queue(this.mutex, async () => {
      const {
        id,
        feeTick,
        feeAmount,
        feeTickPrice,
        sigs,
        paymentPsbt,
        approvePsbt,
      } = req;
      const withdraw = this.tmp[id];
      try {
        need(!!withdraw);
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

        let limit = config.whitelistTick[withdraw.tick]?.withdrawLimit || "0";
        if (!config.openWhitelistTick) {
          limit = "0";
        }
        need(bn(withdraw.amount).gte(limit), `${withdraw_limit}: ${limit}`);

        const { address, tick, amount, ts } = withdraw;
        checkAmount(amount, decimal.get(tick));

        // payment
        const paymentPsbtObj = Psbt.fromHex(paymentPsbt, { network });
        paymentPsbtObj.validateSignaturesOfAllInputs(validator);
        paymentPsbtObj.finalizeAllInputs();
        const paymentTx = paymentPsbtObj.extractTransaction(true);
        const paymentTxid = paymentTx.getId();

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
          },
        };

        // test to pass
        await operator.aggregate(req, true);

        // payment broadcast
        await api.broadcast(paymentTx.toHex());

        // rollup
        await operator.aggregate(req);

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
      const utxos = filterUnconfirmedUTXO(
        filterDustUTXO(await api.addressUTXOs(address))
      );

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
      const delegateWallet = keyring.getDelegateWallet(pubkey);
      const senderWallet = keyring.deriveFromRootWallet(address, "sender");
      const _withdraw = generateConditionalWithdrawTxs({
        op,
        inscribeWallet,
        userWallet,
        feeRate,
        senderWallet,
        userUtxos: _utxos,
        delegateWallet,
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

        type: "conditional",
        ...ret,
      } as any; // TOFIX

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

  async createCancel(
    req: CreateCancelWithdrawReq
  ): Promise<CreateCancelWithdrawRes> {
    return await queue(this.mutex, async () => {
      const { id } = req;
      const withdraw = this.getByOrderId(id);
      need(!!withdraw);
      need(withdraw.status == "order");

      const { address, pubkey, inscriptionId } = withdraw;

      checkAddressType(address);

      const mixedWallet = getMixedPayment(
        Buffer.from(pubkey, "hex"),
        keyring.approveWallet.publicKey
      );

      const allUTXOs = filterDustUTXO(await api.addressUTXOs(address));
      need(allUTXOs.length > 0, insufficient_balance);

      const inscription = await api.inscriptionInfo(inscriptionId);
      const feeRate = env.FeeRate;

      const fixedNum = 1;
      const dust = getDust(address);
      const utxos = getMinUTXOs(allUTXOs, fixedNum, fixedNum, feeRate);

      const vpsbt = new VPsbt();
      vpsbt.addInput({
        hash: inscription.utxo.txid,
        index: inscription.utxo.vout,
        witnessUtxo: {
          script: mixedWallet.output,
          value: inscription.utxo.satoshi,
        },
        witnessScript: mixedWallet.redeem.output,
      }); //i0
      vpsbt.addOutput({
        address,
        value: inscription.utxo.satoshi,
      }); // o0
      for (let i = 0; i < utxos.length; i++) {
        vpsbt.addInput(utxoToInput(utxos[i], { pubkey })); // i1
      }
      vpsbt.addOutput({ address, value: dust }); // o1

      need(
        inscription.offset == 0,
        "inscription offset: " + inscription.offset
      );

      const networkFee = vpsbt.estimateNetworkFee(feeRate);
      const change = getInputAmount(utxos) - networkFee;
      need(change >= dust, utxo_not_enough);

      vpsbt.updateOutput(fixedNum, { address, value: change }); // o1

      return { psbt: vpsbt.toPsbt().toHex(), id, networkFee };
    });
  }

  async confirmCancel(
    req: ConfirmCancelWithdrawReq
  ): Promise<ConfirmCancelWithdrawRes> {
    return await queue(this.mutex, async () => {
      const withdraw = this.getByOrderId(req.id);
      need(!!withdraw);
      need(withdraw.status == "order");

      const psbt = Psbt.fromHex(req.psbt, { network });
      psbt.signAllInputs(keyring.approveWallet.signer);
      psbt.validateSignaturesOfAllInputs(validator);
      psbt.finalizeAllInputs();

      const tx = psbt.extractTransaction(true);
      await api.broadcast(tx.toHex());

      withdraw.status = "pendingCancel";
      await this.update(withdraw);

      return { txid: tx.getId() };
    });
  }
}
