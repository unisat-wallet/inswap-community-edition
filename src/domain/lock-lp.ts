import { Mutex } from "async-mutex";
import { bnDecimal, bnGte, bnUint, decimalCal } from "../contract/bn";
import { getPairStructV2, getPairStrV2 } from "../contract/contract-utils";
import { FuncType } from "../types/func";
import {
  ExportLockLpHistoryReq,
  ExportLockLpHistoryRes,
  FuncReq,
  LockLpHistoryReq,
  LockLpHistoryRes,
  LockLpReq,
  RecordLockLpItem,
  UnlockLpHistoryReq,
  UnlockLpHistoryRes,
  UnLockLpReq,
  UserLockLpInfoReq,
  UserLockLpInfoRes,
} from "../types/route";
import { queue, timeConversion } from "../utils/utils";
import { LP_DECIMAL } from "./constant";
import { invalid_amount, invalid_lock_day } from "./error";
import { checkAddress, checkLockDay, getPoolLp, need } from "./utils";

const TAG = "LockLp";

export class LockLp {
  private mutex = new Mutex();

  async myLockLp(param: UserLockLpInfoReq): Promise<UserLockLpInfoRes> {
    const { tick0: unsortTick0, tick1: unsortTick1, address } = param;
    const pair = getPairStrV2(unsortTick0, unsortTick1);
    const { tick0, tick1 } = getPairStructV2(pair);
    const userLockInfo = await this.getUserLockLp(pair, address);
    const poolLp = getPoolLp(operator.PendingSpace, pair);
    const bnUintAvailableLp = bnUint(userLockInfo.availableLp, LP_DECIMAL);
    const shareOfPool = decimalCal([bnUintAvailableLp, "div", poolLp]);
    const swapAssets = operator.PendingSpace.Assets.dataRefer()["swap"];
    const poolAmount0 = swapAssets[tick0].balanceOf(pair);
    const poolAmount1 = swapAssets[tick1].balanceOf(pair);
    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);
    return {
      ...userLockInfo,
      shareOfPool,
      availableAmount0: bnDecimal(
        decimalCal([poolAmount0, "mul", shareOfPool], decimal0),
        decimal0
      ),
      availableAmount1: bnDecimal(
        decimalCal([poolAmount1, "mul", shareOfPool], decimal1),
        decimal1
      ),
    };
  }

  async getLockHistory(param: LockLpHistoryReq): Promise<LockLpHistoryRes> {
    const {
      tick,
      tick0: unsortTick0,
      tick1: unsortTick1,
      start,
      limit,
      address,
      lockDay,
    } = param;
    if (lockDay) {
      need(lockDay > 0, invalid_lock_day);
    }
    let search: any;
    if (address) {
      checkAddress(address);
      if (unsortTick0 && unsortTick1) {
        const pair = getPairStrV2(unsortTick0, unsortTick1);
        const { tick0, tick1 } = getPairStructV2(pair);
        search = {
          address,
          tick0,
          tick1,
        };
      } else if (tick) {
        const regex = new RegExp(tick, "i");
        search = {
          address,
          $or: [{ tick0: regex }, { tick1: regex }],
        };
      } else {
        search = {
          address,
        };
      }
    } else {
      need(!!unsortTick0 && !!unsortTick1);
      const pair = getPairStrV2(unsortTick0, unsortTick1);
      const { tick0, tick1 } = getPairStructV2(pair);
      search = {
        tick0,
        tick1,
        lockDay: { $gte: lockDay ? lockDay : 1 },
        ts: { $gt: 1764230400000 },
      };
    }
    const total = await recordLockLpDao.count(search);
    const list = await recordLockLpDao.find(search, {
      sort: {
        ts: -1,
      },
      skip: start,
      limit,
    });

    const items: RecordLockLpItem[] = [];
    list.forEach((item) => {
      const { tick0, tick1, lp } = item;
      const pair = getPairStrV2(tick0, tick1);
      const poolLp = getPoolLp(operator.PendingSpace, pair);
      const bnUintAvailableLp = bnUint(lp, LP_DECIMAL);
      const shareOfPool = decimalCal([bnUintAvailableLp, "div", poolLp]);
      items.push({
        ...item,
        shareOfPool,
      });
    });
    return {
      total,
      list: items,
    };
  }

  async getUnlockHistory(
    param: UnlockLpHistoryReq
  ): Promise<UnlockLpHistoryRes> {
    const {
      tick,
      tick0: unsortTick0,
      tick1: unsortTick1,
      start,
      limit,
      address,
    } = param;
    let search: any;
    if (address) {
      checkAddress(address);
      if (unsortTick0 && unsortTick1) {
        const pair = getPairStrV2(unsortTick0, unsortTick1);
        const { tick0, tick1 } = getPairStructV2(pair);
        search = {
          address,
          tick0,
          tick1,
        };
      } else if (tick) {
        const regex = new RegExp(tick, "i");
        search = {
          address,
          $or: [{ tick0: regex }, { tick1: regex }],
        };
      } else {
        search = {
          address,
        };
      }
    } else {
      need(!!unsortTick0 && !!unsortTick1);
      const pair = getPairStrV2(unsortTick0, unsortTick1);
      const { tick0, tick1 } = getPairStructV2(pair);
      search = {
        tick0,
        tick1,
        ts: { $gt: 1764230400000 },
      };
    }
    const total = await recordUnlockLpDao.count(search);
    const list = await recordUnlockLpDao.find(search, {
      sort: {
        ts: -1,
      },
      skip: start,
      limit,
    });
    return {
      total,
      list,
    };
  }

  async lock(req: LockLpReq) {
    return await queue(this.mutex, async () => {
      const {
        address,
        tick0: unsortTick0,
        tick1: unsortTick1,
        amount,
        lockDay,
      } = req;
      checkLockDay(lockDay);
      const pair = getPairStrV2(unsortTick0, unsortTick1);
      const { tick0, tick1 } = getPairStructV2(pair);
      const params: FuncReq = {
        func: FuncType.lock,
        req,
      };
      const res = await operator.aggregate(params, true);
      let lockUser = await lockUserDao.findOne({
        tick0,
        tick1,
        address,
      });
      if (!lockUser) {
        lockUser = {
          address,
          tick0,
          tick1,
          lp: amount,
          lastLockTs: Date.now(),
        };
      } else {
        lockUser.lp = decimalCal([lockUser.lp, "add", amount]);
        lockUser.lastLockTs = Date.now();
      }
      try {
        const id = (res as any).optFunc.id;
        need(!!id);
        await mongoUtils.startTransaction(async (session) => {
          const res = await operator.quoteRemoveLiq({
            address: "",
            tick0: tick0,
            tick1: tick1,
            lp: amount,
          });
          const matchedCount = await recordLockLpDao.upsertData(
            {
              id,
              address,
              tick0,
              tick1,
              lp: req.amount,
              amount0: res.amount0,
              amount1: res.amount1,
              amount0USD: res.amount0USD,
              amount1USD: res.amount1USD,
              lockDay: parseInt(lockDay.slice(0, -1)),
              unlockTime: Date.now() + timeConversion(lockDay, "millisecond"),
              ts: Date.now(),
            },
            { session }
          );
          if (matchedCount == 0) {
            await lockUserDao.upsertData(lockUser, { session });
            await operator.aggregate(params);
          }
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "lock error",
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }
      return {};
    });
  }

  async unlock(req: UnLockLpReq) {
    return await queue(this.mutex, async () => {
      const { address, tick0: unsortTick0, tick1: unsortTick1, amount } = req;
      const pair = getPairStrV2(unsortTick0, unsortTick1);
      const { tick0, tick1 } = getPairStructV2(pair);
      const lockUserInfo = await this.getUserLockLp(pair, address);
      const { lp, availableUnlockLp } = lockUserInfo;
      need(bnGte(availableUnlockLp, amount), invalid_amount);
      const params: FuncReq = {
        func: FuncType.unlock,
        req: {
          tick0,
          tick1,
          ...req,
        },
      };
      const res = await operator.aggregate(params, true);
      try {
        const id = (res as any).optFunc.id;
        need(!!id);
        await mongoUtils.startTransaction(async (session) => {
          const res = await operator.quoteRemoveLiq({
            address: "",
            tick0: tick0,
            tick1: tick1,
            lp: amount,
          });
          const matchedCount = await recordUnlockLpDao.upsertData({
            id,
            address,
            tick0,
            tick1,
            lp: amount,
            amount0: res.amount0,
            amount1: res.amount1,
            amount0USD: res.amount0USD,
            amount1USD: res.amount1USD,
            ts: Date.now(),
          });
          if (matchedCount == 0) {
            await lockUserDao.updateOne(
              {
                address,
                tick0,
                tick1,
              },
              {
                $set: {
                  lp: decimalCal([lp, "sub", amount]),
                },
              },
              { session }
            );
            await operator.aggregate(params);
          }
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "unlock error",
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }
      return {};
    });
  }

  async exportLockLpHistory(
    param: ExportLockLpHistoryReq
  ): Promise<ExportLockLpHistoryRes> {
    const { tick0: unsortTick0, tick1: unsortTick1, lockDay, lockTime } = param;
    if (lockDay) {
      need(lockDay > 0, "Invalid lock day");
    }
    const pair = getPairStrV2(unsortTick0, unsortTick1);
    const { tick0, tick1 } = getPairStructV2(pair);
    let search: any;
    if (!lockTime) {
      search = {
        tick0,
        tick1,
        lockDay: { $gte: lockDay ? lockDay : 1 },
      };
    } else {
      search = {
        tick0,
        tick1,
        lockDay: { $gte: lockDay ? lockDay : 1 },
        ts: { $gte: lockTime },
      };
    }
    const list = await recordLockLpDao.find(search, { sort: { lockDay: -1 } });
    const formatUTCTime = (timestamp: number): string => {
      const date = new Date(timestamp);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");
      return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    };
    const headers = [
      "address",
      "lockDay",
      "lockTime",
      "unlockTime",
      "lp",
      "amount0",
      "amount1",
    ];
    const csvRows = [headers.join(",")];
    for (const item of list) {
      const row = [
        item.address,
        item.lockDay.toString(),
        formatUTCTime(item.ts),
        formatUTCTime(item.unlockTime),
        item.lp,
        item.amount0,
        item.amount1,
      ];
      csvRows.push(row.join(","));
    }
    const csvContent = csvRows.join("\n");
    const timestamp = Math.floor(Date.now() / 1000);
    const fileName = `${tick0}/${tick1}-locklp-${timestamp}.csv`;
    return {
      fileName,
      csvContent,
    };
  }

  async getUserLockLp(pair: string, address: string) {
    const { tick0, tick1 } = getPairStructV2(pair);
    const lockUser = await lockUserDao.findOne({
      tick0,
      tick1,
      address,
    });
    const availableLp =
      operator.PendingSpace.Assets.get(pair).balanceOf(address);
    if (!lockUser) {
      return {
        lp: "0",
        lockLp: "0",
        availableLp: bnDecimal(availableLp, LP_DECIMAL),
        availableUnlockLp: "0",
      };
    }
    const recordLockLpList = await recordLockLpDao.find({
      tick0,
      tick1,
      address,
      unlockTime: { $gt: Date.now() },
    });
    let lockLp = "0";
    recordLockLpList.forEach((record) => {
      lockLp = decimalCal([lockLp, "add", record.lp]);
    });
    return {
      lp: lockUser.lp,
      lockLp: lockLp,
      availableLp: bnDecimal(availableLp, LP_DECIMAL),
      availableUnlockLp: decimalCal([lockUser.lp, "sub", lockLp]),
    };
  }
}
