import { Mutex } from "async-mutex";
import { Psbt } from "bitcoinjs-lib";
import { bn, decimalCal } from "../contract/bn";
import { MatchingData } from "../dao/matching-dao";
import { WithdrawData } from "../dao/withdraw-dao";
import { OpType } from "../types/op";
import {
  ConfirmDepositReq,
  ConfirmDepositRes,
  CreateDepositReq,
  CreateDepositRes,
} from "../types/route";
import { queue } from "../utils/utils";
import { UNCONFIRM_HEIGHT } from "./constant";
import {
  CodeError,
  deposit_error,
  deposit_limit,
  insufficient_balance,
  pending_transaction,
  utxo_not_enough,
} from "./error";
import {
  checkAddressType,
  filterDustUTXO,
  getConfirmedNum,
  getDust,
  getInputAmount,
  getMinUTXOs,
  getMixedPayment,
  need,
  utxoToInput,
} from "./utils";
import { VPsbt } from "./vpsbt";

const lockDelayMs = 120 * 1000;
const nodeDelay = 120;

const TAG = "matching";

export class Matching {
  private mutex = new Mutex();

  // approveId --> newest data
  private newestApprove: { [key: string]: MatchingData } = {};

  // address --> approveId --> data
  readonly statistic: {
    [key: string]: {
      [key: string]: {
        tick: string;
        remain: string;
        lock: boolean;
        ts: number;
      };
    };
  } = {};

  // approveId --> timestamp
  private tmpLock: { [key: string]: number } = {};

  // transferId --> data[]
  private tmpTransferMatching: { [key: string]: MatchingData[] } = {};

  // tick --> ranks
  private tmpRanks: { [key: string]: { address: string; ts: number }[] } = {};
  private tmpRanksTimestamp = Date.now();

  private async checkRollback() {
    const res = await matchingDao.find({
      ts: { $gt: Date.now() / 1000 - 10 * 24 * 3600 },
    });
    const map: { [key: string]: MatchingData } = {};
    for (let i = 0; i < res.length; i++) {
      map[res[i].approveInscriptionId] = res[i];
    }
    for (const key in map) {
      const item = map[key];
      const approveInscription = await api.moduleInscriptionInfo(
        item.approveInscriptionId
      );
      if (
        conditionalWithdraw.getByApproveId(item.approveInscriptionId)?.status ==
        "order"
      ) {
        if (
          approveInscription.data.balance !== item.remainAmount &&
          Date.now() / 1000 - item.ts > 30 * 60
        ) {
          logger.info({
            tag: TAG,
            msg: "matching-rollback",
            approveId: item.approveInscriptionId,
          });
          const res = await matchingDao.findFrom(
            { txid: approveInscription.utxo.txid },
            true
          );
          if (res.length > 0) {
            for (let i = 1; i < res.length; i++) {
              const item = res[i];
              logger.info({
                tag: TAG,
                msg: "matching-rollback-item",
                approveId: item.approveInscriptionId,
                txid: item.txid,
              });
              // await matchingDao.updateOne(
              //   { txid: item.txid },
              //   { $set: { rollback: true } }
              // );
            }
            const approveItem = res[0];
            logger.info({
              tag: TAG,
              msg: "matching-rollback-reset",
              approveId: item.approveInscriptionId,
              item: approveItem,
            });
            // this.updateByApprove(approveItem);
          }
        }
      }
    }
  }

  getRecommendDeposit(tick: string) {
    let ret = "0";
    for (const address in this.statistic) {
      for (const approveId in this.statistic[address]) {
        const item = this.statistic[address][approveId];
        if (item.tick == tick && bn(item.remain).gt(ret)) {
          ret = item.remain;
        }
      }
    }
    return ret;
  }

  getApproveMatching(approveId: string) {
    return this.newestApprove[approveId];
  }

  updateByApprove(approveItem: MatchingData) {
    this.newestApprove[approveItem.approveInscriptionId] = approveItem;
    const remain =
      this.newestApprove[approveItem.approveInscriptionId].remainAmount;

    if (!this.statistic[approveItem.approveAddress]) {
      this.statistic[approveItem.approveAddress] = {};
    }

    if (
      !this.statistic[approveItem.approveAddress][
        approveItem.approveInscriptionId
      ].lock
    ) {
      this.statistic[approveItem.approveAddress][
        approveItem.approveInscriptionId
      ] = {
        tick: approveItem.tick,
        remain,
        lock: false,
        ts: approveItem.ts,
      };
    }
  }

  getWithdrawRanking(address: string, tick: string) {
    if (!this.tmpRanks[tick]) {
      const map: { [key: string]: number } = {};
      for (const address in this.statistic) {
        const approveRemain = this.statistic[address];
        for (const approveId in approveRemain) {
          if (approveRemain[approveId].tick == tick) {
            // matching recently
            if (
              this.newestApprove[approveId] &&
              Date.now() / 1000 - this.newestApprove[approveId].ts <= nodeDelay
            ) {
              continue;
            }

            // tmp lock
            if (this.tmpLock[approveId]) {
              continue;
            }

            if (approveRemain[approveId].remain == "0") {
              continue;
            }

            if (!map[address]) {
              map[address] = approveRemain[approveId].ts;
            }
            map[address] = Math.min(map[address], approveRemain[approveId].ts);
          }
        }
      }
      const ranks: { address: string; ts: number }[] = [];
      for (const address in map) {
        ranks.push({ address, ts: map[address] });
      }
      ranks.sort((a, b) => {
        return a.ts - b.ts;
      });

      this.tmpRanks[tick] = ranks;
    }
    const ranks = this.tmpRanks[tick] || [];

    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i].address == address) {
        return i;
      }
    }
    return ranks.length;
  }

  updateByWithdraw(withdrawItem: WithdrawData) {
    if (!this.statistic[withdrawItem.address]) {
      this.statistic[withdrawItem.address] = {};
    }
    if (withdrawItem.status == "order") {
      this.statistic[withdrawItem.address][withdrawItem.inscriptionId] = {
        tick: withdrawItem.tick,
        remain: withdrawItem.amount,
        lock: false,
        ts: withdrawItem.ts,
      };
    } else {
      this.statistic[withdrawItem.address][withdrawItem.inscriptionId] = {
        tick: withdrawItem.tick,
        remain: "0",
        lock: true,
        ts: withdrawItem.ts,
      };
    }
  }

  async init() {
    const withdrawList = await withdrawDao.find({ type: "conditional" });
    for (let i = 0; i < withdrawList.length; i++) {
      this.updateByWithdraw(withdrawList[i]);
    }

    const matchingList = await matchingDao.findAll();
    for (let i = 0; i < matchingList.length; i++) {
      if (!matchingList[i].rollback) {
        this.updateByApprove(matchingList[i]);
      }
    }
  }
  x;

  async tick() {
    for (const key in this.tmpLock) {
      if (Date.now() - this.tmpLock[key] > lockDelayMs) {
        delete this.tmpLock[key];
      }
    }

    if (Date.now() - this.tmpRanksTimestamp > 60_000) {
      this.tmpRanks = {};
    }

    await this.checkRollback();
  }

  /**
   * try constructing new matching data
   */
  private async tryMatching(params: {
    transferInscriptionId: string;
    transferAddress: string;
    tick: string;
    amount: string;
  }): Promise<MatchingData[]> {
    // TOFIX: consider the scenario of data rollback
    const { transferInscriptionId, transferAddress, tick, amount } = params;

    // address --> remain
    const withdrawAmount: {
      [key: string]: { amount: string; earliestTime: number };
    } = {};

    const nowTs = Math.floor(Date.now() / 1000);

    for (const address in this.statistic) {
      const approveRemain = this.statistic[address];
      for (const approveId in approveRemain) {
        if (approveRemain[approveId].tick == tick) {
          // matching recently
          if (
            this.newestApprove[approveId] &&
            Date.now() / 1000 - this.newestApprove[approveId].ts <= nodeDelay
          ) {
            continue;
          }

          // tmp lock
          if (this.tmpLock[approveId]) {
            continue;
          }

          if (approveRemain[approveId].remain == "0") {
            continue;
          }

          const earliestTime = Math.min(
            conditionalWithdraw.getByApproveId(approveId)?.ts || nowTs,
            withdrawAmount[address]?.earliestTime || nowTs
          );

          withdrawAmount[address] = {
            amount: decimalCal([
              withdrawAmount[address]?.amount || "0",
              "add",
              approveRemain[approveId].remain,
            ]),
            earliestTime,
          };
        }
      }
    }

    let matchingAddresses: string[] = [];
    for (const address in withdrawAmount) {
      if (bn(withdrawAmount[address]?.amount).gte(amount)) {
        matchingAddresses.push(address);
      }
    }

    matchingAddresses = matchingAddresses.sort((a, b) => {
      return withdrawAmount[a].earliestTime - withdrawAmount[b].earliestTime;
    });

    if (matchingAddresses.length > 0) {
      for (let i = 0; i < matchingAddresses.length; i++) {
        const approveAddress = matchingAddresses[i];

        let consume = "0";
        const ret: MatchingData[] = [];
        const approveRemain = this.statistic[approveAddress];

        const approveRemainList: {
          tick: string;
          remain: string;
          lock: boolean;
          ts: number;
          approveId: string;
        }[] = [];
        for (const approveId in approveRemain) {
          approveRemainList.push({ ...approveRemain[approveId], approveId });
        }
        approveRemainList.sort((a, b) => {
          return (
            conditionalWithdraw.getByApproveId(a.approveId)?.ts ||
            nowTs - conditionalWithdraw.getByApproveId(b.approveId)?.ts ||
            nowTs
          );
        });

        for (let i = 0; i < approveRemainList.length; i++) {
          const approveRemainItem = approveRemainList[i];
          const approveId = approveRemainItem.approveId;

          if (bn(approveRemainItem.remain).eq("0")) {
            continue;
          }
          if (approveRemainItem.tick !== tick) {
            continue;
          }
          // tmp lock
          if (this.tmpLock[approveId]) {
            continue;
          }
          if (this.newestApprove[approveId]) {
            // matching recently
            if (
              Date.now() / 1000 - this.newestApprove[approveId].ts <=
              nodeDelay
            ) {
              continue;
            }

            // unconfirm
            const info = await api.txInfo(this.newestApprove[approveId].txid);
            if (info.height == UNCONFIRM_HEIGHT) {
              continue;
            }
          }

          let item: MatchingData;
          if (
            bn(decimalCal([consume, "add", approveRemainItem.remain])).gt(
              amount
            )
          ) {
            const consumeAmount = decimalCal([amount, "sub", consume]);
            item = {
              approveInscriptionId: approveId,
              transferInscriptionId,
              tick: approveRemainItem.tick,
              consumeAmount,
              remainAmount: decimalCal([
                approveRemainItem.remain,
                "sub",
                consumeAmount,
              ]),
              transferAddress,
              approveAddress,
              txid: "",
              ts: Math.floor(Date.now() / 1000),
            };
          } else {
            need(bn(approveRemainItem.remain).gt("0"));
            item = {
              approveInscriptionId: approveId,
              transferInscriptionId,
              tick: approveRemainItem.tick,
              consumeAmount: approveRemainItem.remain,
              remainAmount: "0",
              transferAddress,
              approveAddress,
              txid: "",
              ts: Math.floor(Date.now() / 1000),
            };
          }

          const approveInscription = await api.moduleInscriptionInfo(approveId);
          if (
            !approveInscription.data ||
            !bn(approveInscription.data.balance).eq(
              decimalCal([item.remainAmount, "add", item.consumeAmount])
            ) ||
            approveInscription.data.tick !== item.tick ||
            approveInscription.data.module !== config.moduleId ||
            approveInscription.data.op !== OpType.conditionalApprove
          ) {
            logger.error({
              tag: TAG,
              msg: "approve verify fail",
              infoFromApi: approveInscription,
              infoFromDao: item,
            });
            continue;
          }

          ret.push(item);
          consume = decimalCal([consume, "add", item.consumeAmount]);
          if (bn(consume).gte(amount)) {
            return ret;
          }
        }
      }
    }
    return [];
  }

  async create(req: CreateDepositReq): Promise<CreateDepositRes> {
    return await queue(this.mutex, async () => {
      const { inscriptionId, address, pubkey } = req;
      const inscription = await api.inscriptionInfo(inscriptionId);
      need(!!inscription && !!inscription.brc20, pending_transaction);

      const res = await query.getDailyDepositLimit(
        address,
        inscription.brc20.tick
      );
      need(
        bn(res.dailyLimit).gte(
          decimalCal([res.dailyAmount, "add", inscription.brc20.amt])
        ),
        deposit_limit
      );

      const list = await this.tryMatching({
        transferInscriptionId: inscriptionId,
        transferAddress: inscription.address,
        tick: inscription.brc20.tick,
        amount: inscription.brc20.amt,
      });
      need(
        getConfirmedNum(inscription.utxo.height) >= config.pendingTransferNum,
        `The transaction requires ${config.pendingTransferNum} confirmations`
      );
      if (list.length == 0) {
        return await deposit.create(req);
      } else {
        const withdrawItem = conditionalWithdraw.getByApproveId(
          list[0].approveInscriptionId
        );
        need(!!withdrawItem);
        const approveAddress = withdrawItem.address;
        const approvePubkey = withdrawItem.pubkey;
        const approveInscriptions = list.map((a) => {
          return a.approveInscriptionId;
        });

        checkAddressType(address);

        this.tmpTransferMatching[inscriptionId] = list;

        const mixedWallet = getMixedPayment(
          Buffer.from(approvePubkey, "hex"),
          keyring.approveWallet.publicKey
        );

        const allUTXOs = filterDustUTXO(await api.addressUTXOs(address));
        need(allUTXOs.length > 0, insufficient_balance);

        const feeRate = env.FeeRate;

        const fixedNum = approveInscriptions.length + 1;
        const dust = getDust(address);
        const utxos = getMinUTXOs(allUTXOs, fixedNum, fixedNum, feeRate);

        const vpsbt = new VPsbt();
        for (let i = 0; i < approveInscriptions.length; i++) {
          const item = list[i];
          const approveInscription = await api.moduleInscriptionInfo(
            approveInscriptions[i]
          );
          if (
            !approveInscription.data ||
            !bn(approveInscription.data.balance).eq(
              decimalCal([item.remainAmount, "add", item.consumeAmount])
            ) ||
            approveInscription.data.tick !== item.tick ||
            approveInscription.data.module !== config.moduleId ||
            approveInscription.data.op !== OpType.conditionalApprove
          ) {
            logger.error({
              tag: TAG,
              msg: "approve verify fail",
              infoFromApi: approveInscription,
              infoFromDao: item,
            });
            throw new CodeError(deposit_error);
          }
          const approveInscriptionUTXO = approveInscription.utxo;
          vpsbt.addInput({
            hash: approveInscriptionUTXO.txid,
            index: approveInscriptionUTXO.vout,
            witnessUtxo: {
              script: mixedWallet.output,
              value: approveInscriptionUTXO.satoshi,
            },
            witnessScript: mixedWallet.redeem.output,
          }); //i0
          vpsbt.addOutput({
            address: mixedWallet.address,
            value: approveInscriptionUTXO.satoshi,
          }); // o0
        }
        const nftValue = Math.max(
          inscription.utxo.satoshi,
          getDust(approveAddress)
        );
        const gap = Math.abs(nftValue - inscription.utxo.satoshi);
        vpsbt.addInput(utxoToInput(inscription.utxo, { pubkey })); //i1
        vpsbt.addOutput({
          address: approveAddress,
          value: nftValue,
        }); // o1
        for (let i = 0; i < utxos.length; i++) {
          vpsbt.addInput(utxoToInput(utxos[i], { pubkey })); // i2
        }
        vpsbt.addOutput({ address, value: dust }); // o2

        need(
          inscription.offset == 0,
          "inscription offset: " + inscription.offset
        );

        const networkFee = vpsbt.estimateNetworkFee(feeRate);
        const change = getInputAmount(utxos) - networkFee - gap;
        need(change >= dust, utxo_not_enough);

        vpsbt.updateOutput(fixedNum, { address, value: change }); // o2

        // tmp lock withdraw order
        for (let i = 0; i < approveInscriptions.length; i++) {
          const inscriptionId = approveInscriptions[i];
          this.tmpLock[inscriptionId] = Date.now();
        }

        return {
          psbt: vpsbt.toPsbt().toHex(),
          type: "matching",
          expiredTimestamp: Date.now() + lockDelayMs,
          recommendDeposit: matching.getRecommendDeposit(
            inscription.brc20.tick
          ),
        };
      }
    });
  }

  async confirm(req: ConfirmDepositReq): Promise<ConfirmDepositRes> {
    return await queue(this.mutex, async () => {
      const inscriptionId = req.inscriptionId;
      const matching = this.tmpTransferMatching[inscriptionId];
      if (matching) {
        const psbt = Psbt.fromHex(req.psbt, { network });
        psbt.signAllInputs(keyring.approveWallet.signer);

        const ret = await deposit.confirm(
          {
            inscriptionId,
            transferIndex: matching.length,
            psbt: psbt.toHex(),
          },
          "matching"
        );
        matching.forEach((item) => {
          item.txid = ret.txid;
          item.ts = Math.floor(Date.now() / 1000);
          this.updateByApprove(item);
        });

        await matchingDao.insertMany(matching);
        delete this.tmpTransferMatching[inscriptionId];
        ret.pendingNum = config.pendingDepositMatchingNum;
        return ret;
      } else {
        return await deposit.confirm(req);
      }
    });
  }
}
