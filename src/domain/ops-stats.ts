import { bnDecimal, decimalCal } from "../contract/bn";
import { getPairStrV1, getPairStrV2 } from "../contract/contract-utils";
import {
  OpsCurStatsRes,
  OpsRangeNetInflowReq,
  OpsRangeNetInflowRes,
  OpsRangeStatsReq,
  OpsRangeStatsRes,
  OpsTimeStatsReq,
  OpsTimeStatsRes,
} from "../types/route-status";
import { getLpInfo } from "./utils";

const TAG = "OpsStats";

export class OpsStats {
  async tick() {
    const res = await this.getCurOpsStats("tvl");
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      const pair = item.pair;
      await opsStatsDao.insert({
        pair,
        totalVolumeValue: item.totalVolumeValue,
        totalTvlValue: item.totalTvlValue,
        lpAddressMap: item.lpAddressMap,
        totalLockedLpValue: item.totalLockedLpValue,
        timestamp: Date.now(),
      });
    }
  }

  async getRangeVolumeValueMap(params: {
    startTime: number;
    endTime: number;
  }): Promise<{ [pair: string]: number }> {
    const { startTime, endTime } = params;

    const res = await recordSwapDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
        },
      },
      {
        $project: {
          normalizedPair: {
            $cond: [
              { $lt: ["$tickIn", "$tickOut"] },
              { $concat: ["$tickIn", "/", "$tickOut"] },
              { $concat: ["$tickOut", "/", "$tickIn"] },
            ],
          },
          amountIn: { $toDouble: "$amountIn" },
          amountOut: { $toDouble: "$amountOut" },
        },
      },
      {
        $group: {
          _id: "$normalizedPair",
          volumeIn: { $sum: "$amountIn" },
          volumeOut: { $sum: "$amountOut" },
        },
      },
    ]);

    const result: { [pair: string]: number } = {};
    for (const item of res) {
      const [tick0, tick1] = item._id.split("/");
      const tick0Price = await query.getTickPrice(tick0);
      const tick1Price = await query.getTickPrice(tick1);

      const volumeValue0 = decimalCal([item.volumeIn, "mul", tick0Price]);
      const volumeValue1 = decimalCal([item.volumeOut, "mul", tick1Price]);
      result[item._id] = Math.min(
        parseFloat(volumeValue0),
        parseFloat(volumeValue1)
      );
    }

    return result;
  }

  async getRangeVolumeValue(params: {
    pair: string;
    startTime: number;
    endTime: number;
  }) {
    const { pair, startTime, endTime } = params;
    const [tick0, tick1] = pair.split("/");
    const tick0Price = await query.getTickPrice(tick0);
    const tick1Price = await query.getTickPrice(tick1);
    let sum = 0;

    const res = await recordSwapDao.aggregate([
      {
        $match: {
          tickIn: tick0,
          tickOut: tick1,
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
        },
      },
      {
        $group: {
          _id: null,
          volume0: { $sum: { $toDouble: "$amountIn" } },
          volume1: { $sum: { $toDouble: "$amountOut" } },
        },
      },
    ]);
    if (res.length > 0) {
      const volumeValue0 = decimalCal([res[0].volume0, "mul", tick0Price]);
      const volumeValue1 = decimalCal([res[0].volume1, "mul", tick1Price]);
      sum += Math.min(parseFloat(volumeValue0), parseFloat(volumeValue1));
    }

    const res2 = await recordSwapDao.aggregate([
      {
        $match: {
          tickIn: tick1,
          tickOut: tick0,
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
        },
      },
      {
        $group: {
          _id: null,
          volume1: { $sum: { $toDouble: "$amountIn" } },
          volume0: { $sum: { $toDouble: "$amountOut" } },
        },
      },
    ]);
    if (res2.length > 0) {
      const volumeValue0 = decimalCal([res2[0].volume0, "mul", tick0Price]);
      const volumeValue1 = decimalCal([res2[0].volume1, "mul", tick1Price]);
      sum += Math.min(parseFloat(volumeValue0), parseFloat(volumeValue1));
    }
    logger.debug({
      tag: TAG,
      msg: "getRangeVolumeValue",
      tick0,
      tick1,
      tick0Price,
      tick1Price,
      res,
      res2,
    });
    return sum;
  }

  async getRangeLockedLpAddressMap(params: {
    startTime: number;
    endTime: number;
  }): Promise<{ [pair: string]: number }> {
    const { startTime, endTime } = params;

    const res = await stakeHistoryDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
          type: { $in: ["stake"] },
        },
      },
      {
        $project: {
          normalizedPair: {
            $cond: [
              { $lt: ["$poolTick0", "$poolTick1"] },
              { $concat: ["$poolTick0", "/", "$poolTick1"] },
              { $concat: ["$poolTick1", "/", "$poolTick0"] },
            ],
          },
          address: 1,
        },
      },
      {
        $group: {
          _id: "$normalizedPair",
          addresses: { $addToSet: "$address" },
        },
      },
      {
        $project: {
          _id: 1,
          count: { $size: "$addresses" },
        },
      },
    ]);

    const result: { [pair: string]: number } = {};
    for (const item of res) {
      result[item._id] = item.count;
    }

    return result;
  }

  async getRangeLockedLpAddress(params: {
    pair: string;
    startTime: number;
    endTime: number;
  }): Promise<number> {
    const { pair, startTime, endTime } = params;
    const [tick0, tick1] = pair.split("/");

    const res = await stakeHistoryDao.aggregate([
      {
        $match: {
          $or: [
            { poolTick0: tick0, poolTick1: tick1 },
            { poolTick0: tick1, poolTick1: tick0 },
          ],
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
          type: { $in: ["stake"] },
        },
      },
      {
        $group: {
          _id: "$address",
        },
      },
    ]);
    return res.length;
  }

  async getRangeLockedLpValueMap(params: {
    startTime: number;
    endTime: number;
  }): Promise<{ [pair: string]: number }> {
    const { startTime, endTime } = params;

    const res = await stakeHistoryDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
          type: { $in: ["stake", "unstake"] },
        },
      },
      {
        $project: {
          normalizedPair: {
            $cond: [
              { $lt: ["$poolTick0", "$poolTick1"] },
              { $concat: ["$poolTick0", "/", "$poolTick1"] },
              { $concat: ["$poolTick1", "/", "$poolTick0"] },
            ],
          },
          amount: {
            $cond: [
              { $eq: ["$type", "stake"] },
              { $toDouble: "$amount" },
              { $multiply: [{ $toDouble: "$amount" }, -1] },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$normalizedPair",
          lp: { $sum: "$amount" },
        },
      },
    ]);

    const result: { [pair: string]: number } = {};
    for (const item of res) {
      const [tick0, tick1] = item._id.split("/");
      const lpValue = (
        await getLpInfo({
          tick0,
          tick1,
          lp: item.lp.toFixed(18),
        })
      ).value;
      result[item._id] = lpValue;
    }

    return result;
  }

  async getRangeLockedLpValue(params: {
    pair: string;
    startTime: number;
    endTime: number;
  }): Promise<number> {
    const { pair, startTime, endTime } = params;
    const [tick0, tick1] = pair.split("/");

    const res = await stakeHistoryDao.aggregate([
      {
        $match: {
          $or: [
            { poolTick0: tick0, poolTick1: tick1 },
            { poolTick0: tick1, poolTick1: tick0 },
          ],
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
          type: { $in: ["stake", "unstake"] },
        },
      },
      {
        $group: {
          _id: null,
          lp: {
            $sum: {
              $cond: [
                { $eq: ["$type", "stake"] },
                { $toDouble: "$amount" },
                { $multiply: [{ $toDouble: "$amount" }, -1] },
              ],
            },
          },
        },
      },
    ]);
    if (res.length > 0) {
      const lp = res[0].lp;
      const lpValue = (
        await getLpInfo({
          tick0,
          tick1,
          lp: lp.toFixed(18),
        })
      ).value;
      return lpValue;
    }
    return 0;
  }

  async getRangeLpAddressInfoMap(params: {
    startTime: number;
    endTime: number;
  }): Promise<{
    [pair: string]: {
      count: number;
      lpAddressMap: { [lockedLpValue: string]: number };
    };
  }> {
    const { startTime, endTime } = params;

    const res = await recordLiqDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
        },
      },
      {
        $project: {
          normalizedPair: {
            $cond: [
              { $lt: ["$tick0", "$tick1"] },
              { $concat: ["$tick0", "/", "$tick1"] },
              { $concat: ["$tick1", "/", "$tick0"] },
            ],
          },
          address: "$address",
          lp: {
            $cond: [
              { $eq: ["$type", "add"] },
              { $toDouble: "$lp" },
              { $multiply: [{ $toDouble: "$lp" }, -1] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { pair: "$normalizedPair", address: "$address" },
          lp: { $sum: "$lp" },
        },
      },
      {
        $group: {
          _id: "$_id.pair",
          addresses: {
            $push: {
              address: "$_id.address",
              lp: "$lp",
            },
          },
        },
      },
    ]);

    const result: {
      [pair: string]: {
        count: number;
        lpAddressMap: { [lockedLpValue: string]: number };
      };
    } = {};

    for (const item of res) {
      const pair = item._id;
      const addresses = item.addresses;

      let count = 0;
      const sectionArr = [1, 10, 100, 1000, 10000, 100000, 1000000];
      const lpAddressMap: { [lockedLpValue: string]: number } = {};

      for (const addressInfo of addresses) {
        if (addressInfo.lp > 0) {
          count++;
        }

        const [tick0, tick1] = pair.split("/");
        const value = (
          await getLpInfo({
            tick0,
            tick1,
            lp: addressInfo.lp.toFixed(18),
          })
        ).value;

        let section = 0;
        for (let j = 0; j < sectionArr.length; j++) {
          if (value < sectionArr[j]) {
            section = sectionArr[j];
            break;
          }
        }
        if (!lpAddressMap[section]) {
          lpAddressMap[section] = 0;
        }
        lpAddressMap[section] += 1;
      }

      result[pair] = { count, lpAddressMap };
    }

    return result;
  }

  async getRangeLpAddressInfo(params: {
    pair: string;
    startTime: number;
    endTime: number;
  }): Promise<{
    count: number;
    lpAddressMap: { [lockedLpValue: string]: number };
  }> {
    const { pair, startTime, endTime } = params;
    const [tick0, tick1] = pair.split("/");

    /**
     * I have this recordLiqDao table and RecordLiqData data structure. Through it, I can count the lp list within a certain time range, getting a list similar to {address, tick0, tick1, lp}. For each address, if the type is 'add', add lp; if it is 'remove', subtract lp. Then sort by lp in descending order.
     *
     */
    const res = await recordLiqDao.aggregate([
      {
        $match: {
          tick0,
          tick1,
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
        },
      },
      {
        $group: {
          _id: "$address",
          lp: {
            $sum: {
              $cond: [
                { $eq: ["$type", "add"] },
                { $toDouble: "$lp" },
                { $multiply: [{ $toDouble: "$lp" }, -1] },
              ],
            },
          },
        },
      },
      {
        $sort: {
          lp: -1,
        },
      },
    ]);

    let count = 0;
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      if (item.lp > 0) {
        count++;
      }
    }
    const sectionArr = [1, 10, 100, 1000, 10000, 100000, 1000000];
    const lpAddressMap: { [lockedLpValue: string]: number } = {};
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      const value = (
        await getLpInfo({
          tick0,
          tick1,
          lp: item.lp.toFixed(18),
        })
      ).value;

      let section = 0;
      for (let j = 0; j < sectionArr.length; j++) {
        if (value < sectionArr[j]) {
          section = sectionArr[j];
          break;
        }
      }
      if (!lpAddressMap[section]) {
        lpAddressMap[section] = 0;
      }
      lpAddressMap[section] += 1;
    }

    logger.debug({
      tag: TAG,
      msg: "getRangeLpAddressInfo",
      pair,
      startTime,
      endTime,
      lpAddressMap,
      count,
    });
    return { count, lpAddressMap };
  }

  async getRangeSwapAddressCountMap(params: {
    startTime: number;
    endTime: number;
  }): Promise<{ [pair: string]: number }> {
    const { startTime, endTime } = params;

    /**
     * I have a recordSwapDao table and RecordSwapData data structure. Through it, I can count the number of swap addresses for all pairs within a certain time range. I will aggregate the data and normalize pairs (e.g., sFB/sBTC and sBTC/sFB are treated as the same pair) before returning the result as a map.
     */
    const res = await recordSwapDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
        },
      },
      {
        $project: {
          normalizedPair: {
            $cond: [
              { $lt: ["$tickIn", "$tickOut"] },
              { $concat: ["$tickIn", "/", "$tickOut"] },
              { $concat: ["$tickOut", "/", "$tickIn"] },
            ],
          },
          address: "$address",
        },
      },
      {
        $group: {
          _id: { pair: "$normalizedPair", address: "$address" },
        },
      },
      {
        $group: {
          _id: "$_id.pair",
          count: { $sum: 1 },
        },
      },
    ]);

    const result: { [pair: string]: number } = {};
    for (const item of res) {
      result[item._id] = item.count;
    }

    return result;
  }

  async getRangeSwapAddressCount(params: {
    pair: string;
    startTime: number;
    endTime: number;
  }) {
    const { pair, startTime, endTime } = params;
    const [tick0, tick1] = pair.split("/");

    /**
     * I have a recordSwapDao table and RecordSwapData data structure. Through it, I can count the number of swap addresses within a certain time range. I can first add them to a collection and then return the size of the collection.
     */
    const res = await recordSwapDao.aggregate([
      {
        $match: {
          $or: [
            {
              tickIn: tick0,
              tickOut: tick1,
              ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
            },
            {
              tickIn: tick1,
              tickOut: tick0,
              ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
            },
          ],
        },
      },
      {
        $group: {
          _id: "$address",
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]);
    return res.length > 0 ? res[0].count : 0;
  }

  async getCurTotalTvlValue(params: { pair: string }) {
    const { pair } = params;
    const [tick0, tick1] = pair.split("/");
    const tick0Price = await query.getTickPrice(tick0);
    const tick1Price = await query.getTickPrice(tick1);
    const _pair = getPairStrV2(tick0, tick1);
    const poolTick0Amount = bnDecimal(
      operator.PendingSpace.Assets.get(tick0).balanceOf(_pair),
      decimal.get(tick0)
    );
    const poolTick1Amount = bnDecimal(
      operator.PendingSpace.Assets.get(tick1).balanceOf(_pair),
      decimal.get(tick1)
    );
    const poolTick0Value = decimalCal([poolTick0Amount, "mul", tick0Price]);
    const poolTick1Value = decimalCal([poolTick1Amount, "mul", tick1Price]);
    const totalValue = decimalCal([poolTick0Value, "add", poolTick1Value]);
    return parseFloat(totalValue);
  }

  async getCurTotalLockedLpValue(params: { pair: string }) {
    const { pair } = params;
    const [tick0, tick1] = pair.split("/");
    const res = await stakeUserDao.aggregate([
      {
        $match: {
          tick0,
          tick1,
        },
      },
      {
        $group: {
          _id: null,
          lp: { $sum: { $toDouble: "$amount" } },
        },
      },
    ]);
    if (res.length > 0) {
      const lp = res[0].lp;
      const lpValue = (
        await getLpInfo({
          tick0,
          tick1,
          lp: lp.toFixed(18),
        })
      ).value;
      return lpValue;
    } else {
      return 0;
    }
  }

  async getCurOpsStats(
    sort: "tvl" | "24h" | "7d" | "30d"
  ): Promise<OpsCurStatsRes> {
    const res = await query.poolList({
      start: 0,
      limit: 20,
      sort,
    });
    const ret: OpsCurStatsRes = [];
    for (let i = 0; i < res.list.length; i++) {
      const item = res.list[i];
      const pair = getPairStrV1(item.tick0, item.tick1);
      ret.push({
        pair,
        totalVolumeValue: await this.getRangeVolumeValue({
          pair,
          startTime: 0,
          endTime: Date.now(),
        }),
        totalTvlValue: await this.getCurTotalTvlValue({
          pair,
        }),
        lpAddressMap: (
          await this.getRangeLpAddressInfo({
            pair,
            startTime: 0,
            endTime: Date.now(),
          })
        ).lpAddressMap,
        totalLockedLpValue: await this.getCurTotalLockedLpValue({
          pair,
        }),
      });
    }
    return ret;
  }

  async getRangeOpsStats(params: OpsRangeStatsReq): Promise<OpsRangeStatsRes> {
    const ret: OpsRangeStatsRes = [];
    const { startTime, endTime } = params;

    const res = await query.poolList({
      start: 0,
      limit: 100,
      sort: "tvl",
    });

    const rangeSwapAddressCountMap = await this.getRangeSwapAddressCountMap({
      startTime,
      endTime,
    });
    const rangeLockedLpValueMap = await this.getRangeLockedLpValueMap({
      startTime,
      endTime,
    });
    const rangeLockedLpAddressMap = await this.getRangeLockedLpAddressMap({
      startTime,
      endTime,
    });
    const rangeLpAddressInfoMap = await this.getRangeLpAddressInfoMap({
      startTime,
      endTime,
    });
    const rangeVolumeValueMap = await this.getRangeVolumeValueMap({
      startTime,
      endTime,
    });
    logger.debug({
      tag: TAG,
      msg: "getRangeOpsStats",
      rangeSwapAddressCountMap,
      rangeLockedLpValueMap,
      rangeLockedLpAddressMap,
      rangeLpAddressInfoMap,
      rangeVolumeValueMap,
    });

    for (let i = 0; i < res.list.length; i++) {
      const item = res.list[i];
      const pair = getPairStrV1(item.tick0, item.tick1);
      try {
        ret.push({
          pair,
          rangeVolumeValue: rangeVolumeValueMap[pair] || 0,
          rangeLpAddressCount: rangeLpAddressInfoMap[pair]?.count || 0,
          rangeSwapAddressCount: rangeSwapAddressCountMap[pair] || 0,
          rangeLockedLpValue: rangeLockedLpValueMap[pair] || 0,
          rangeLockedLpAddress: rangeLockedLpAddressMap[pair] || 0,
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "Error in getRangeOpsStats",
          pair,
          error: err.message,
          stake: err.stack,
        });
        throw err;
      }
    }
    ret.sort((a, b) => {
      if (params.sort === "rangeVolumeValue") {
        return b.rangeVolumeValue - a.rangeVolumeValue;
      } else if (params.sort === "rangeLpAddressCount") {
        return b.rangeLpAddressCount - a.rangeLpAddressCount;
      } else if (params.sort === "rangeSwapAddressCount") {
        return b.rangeSwapAddressCount - a.rangeSwapAddressCount;
      } else if (params.sort === "rangeLockedLpValue") {
        return b.rangeLockedLpValue - a.rangeLockedLpValue;
      } else if (params.sort === "rangeLockedLpAddress") {
        return b.rangeLockedLpAddress - a.rangeLockedLpAddress;
      }
    });

    return ret;
  }

  async getRangeOpsNetInflow(
    params: OpsRangeNetInflowReq
  ): Promise<OpsRangeNetInflowRes> {
    const ret: OpsRangeNetInflowRes = [];
    const { startTime, endTime } = params;

    const res = await query.poolList({
      start: 0,
      limit: 20,
      sort: "tvl",
    });

    const ticks: Set<string> = new Set();
    for (let i = 0; i < res.list.length; i++) {
      const item = res.list[i];
      ticks.add(item.tick0);
      ticks.add(item.tick1);
    }
    const tickList = Array.from(ticks);
    const depositRes = await depositDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
          tick: { $in: tickList },
        },
      },
      {
        $group: {
          _id: "$tick",
          deposit: { $sum: { $toDouble: "$amount" } },
        },
      },
    ]);
    const withdrawRes = await withdrawDao.aggregate([
      {
        $match: {
          ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
          tick: { $in: tickList },
          status: { $nin: ["error"] },
        },
      },
      {
        $group: {
          _id: "$tick",
          withdraw: { $sum: { $toDouble: "$amount" } },
        },
      },
    ]);
    const depositMap: { [key: string]: number } = {};
    const withdrawMap: { [key: string]: number } = {};
    for (let i = 0; i < depositRes.length; i++) {
      const item = depositRes[i];
      depositMap[item._id] = item.deposit;
    }
    for (let i = 0; i < withdrawRes.length; i++) {
      const item = withdrawRes[i];
      withdrawMap[item._id] = item.withdraw;
    }
    for (let i = 0; i < tickList.length; i++) {
      const tick = tickList[i];
      const deposit = depositMap[tick] || 0;
      const withdraw = withdrawMap[tick] || 0;
      const netInflow = deposit - withdraw;
      const price = await query.getTickPrice(tick);
      const value = price * netInflow;
      ret.push({
        tick,
        deposit,
        withdraw,
        netInflow,
        value,
      });
    }
    ret.sort((a, b) => {
      return b.value - a.value;
    });
    return ret;
  }

  async getTimeOpsStats(params: OpsTimeStatsReq): Promise<OpsTimeStatsRes> {
    const start = params.timestamp - 3600 * 1000;
    const end = params.timestamp + 3600 * 1000;
    const res = await opsStatsDao.find({ timestamp: { $gt: start, $lt: end } });
    const map = {};
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      map[item.pair] = item;
    }

    const ret: OpsTimeStatsRes = [];
    for (const pair in map) {
      const item = map[pair];
      ret.push(item);
    }
    return ret;
  }
}
