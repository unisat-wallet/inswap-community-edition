import _ from "lodash";
import { bn, bnDecimal, decimalCal } from "../contract/bn";
import {
  getPairStructV2,
  getPairStrV1,
  getPairStrV2,
} from "../contract/contract-utils";
import { BridgeHistoryReq } from "../lib/bridge-api/types";
import { AlkanesSummary, Brc20Summary, RunesSummary } from "../types/api";
import { AddressTickBalance } from "../types/domain";
import { FuncType } from "../types/func";
import { CommitOp } from "../types/op";
import {
  AddressGasReq,
  AddressGasRes,
  AllAddressBalanceReq,
  AllAddressBalanceRes,
  AssetsUSDReq,
  AssetsUSDRes,
  AssetType,
  BurnHistoryReq,
  BurnHistoryRes,
  CommunityInfoReq,
  CommunityInfoRes,
  CommunityListReq,
  CommunityListRes,
  ConditionalWithdrawHistoryItem,
  DepositItemStatus,
  DepositListItem,
  DepositListReq,
  DepositProcessReq,
  DepositProcessRes,
  GasHistoryReq,
  GasHistoryRes,
  LiqHistoryReq,
  LiqHistoryRes,
  LockLpItem,
  LpRewardHistoryReq,
  MultiSwapHistoryRes,
  MyPoolListItem,
  MyPoolListReq,
  MyPoolReq,
  MyPoolRes,
  NetworkType,
  OverViewReq,
  OverViewRes,
  PoolHoldersReq,
  PoolHoldersRes,
  PoolInfoReq,
  PoolInfoRes,
  PoolListItem,
  PoolListReq,
  PoolListRes,
  PriceLineReq,
  PriceLineRes,
  RewardCurveReq,
  RewardCurveRes,
  RollUpHistoryItem,
  RollUpHistoryReq,
  RollUpHistoryRes,
  SelectDepositReq,
  SelectDepositRes,
  SelectPoolReq,
  SelectPoolRes,
  SelectReq,
  SelectRes,
  SendHistoryReq,
  SendHistoryRes,
  SendLpHistoryReq,
  SendLpHistoryRes,
  SwapHistoryReq,
  SwapHistoryRes,
  TaskListReq,
  TaskListRes,
  TickHoldersReq,
  TickHoldersRes,
  WithdrawHistoryReq,
  WithdrawHistoryRes,
  WithdrawProcessReq,
  WithdrawProcessRes,
} from "../types/route";
import { getAddress, getTodayMidnightSec } from "../utils/utils";
import { PRICE_TICKER_MAP } from "./api";
import {
  BITCOIN_NAME,
  DEFAULT_GAS_TICK,
  L1_BITCOIN_NAME,
  LP_DECIMAL,
  MIN_TVL,
  PRICE_DECIMAL,
  QUOTA_ASSETS,
  UNCONFIRM_HEIGHT,
  ZERO_ADDRESS,
} from "./constant";
import {
  checkTick,
  getAddressType,
  getConfirmedNum,
  getL1AssetType,
  getL1NetworkType,
  getLpInfo,
  getPoolLp,
  heightConfirmNum,
  isLp,
  isMatch,
  l1ToL2TickName,
  l2ToL1TickName,
  need,
} from "./utils";

const TAG = "query";

export class Query {
  private cache: {
    [key: string]: { timestamp: number; intervalMs: number; data: any };
  } = {};

  // Cache for count queries to improve performance
  private countCache = new Map<string, { count: number; timestamp: number }>();
  private readonly COUNT_CACHE_TTL = 300000; // 1 minute cache

  async update() {
    const assets = operator.PendingSpace.Assets.dataRefer()["swap"];
    for (const tick in assets) {
      if (isLp(tick)) {
        const item = await this.calPoolInfo(tick);
        await poolListDao.upsertOne(
          { tick0: item.tick0, tick1: item.tick1 },
          {
            $set: {
              tick0: item.tick0,
              tick1: item.tick1,
              amount0: parseFloat(item.amount0),
              amount1: parseFloat(item.amount1),
              lp: parseFloat(item.lp),
              tvl: parseFloat(item.tvl),
              volume24h: parseFloat(item.volume24h),
              volume7d: parseFloat(item.volume7d),
              volume30d: parseFloat(item.volume30d),
              reward0: parseFloat(item.reward0),
              reward1: parseFloat(item.reward1),
              updateTime: Date.now(),
            },
          }
        );
      }
    }
  }

  async getDailyDepositLimit(address: string, tick: string) {
    const todayMidnightSec = getTodayMidnightSec();
    const res = await depositDao.find({
      address,
      tick,
      ts: { $gte: Math.floor(todayMidnightSec) },
    });
    let dailyAmount = "0";
    res.forEach((item) => {
      dailyAmount = decimalCal([dailyAmount, "add", item.amount]);
    });
    let dailyLimit = config.whitelistTick[tick]?.depositLimit || "0";
    if (!config.openWhitelistTick) {
      dailyLimit = "999999";
    }

    return { dailyAmount, dailyLimit };
  }

  private async aggregateVolume(
    tick0: string,
    tick1: string,
    date: "24h" | "7d" | "30d",
    address?: string
  ): Promise<string> {
    let interval = 0;
    if (date == "24h") {
      interval = 3600 * 24;
    } else if (date == "7d") {
      interval = 3600 * 24 * 7;
    } else if (date == "30d") {
      interval = 3600 * 24 * 30;
    }

    const query1 = {
      tickIn: tick0,
      tickOut: tick1,
      ts: {
        $gte: Date.now() / 1000 - interval,
      },
    };
    if (address) {
      query1["address"] = address;
    }
    const res = await recordSwapDao.aggregate([
      {
        $match: query1,
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: "$value" },
        },
      },
    ]);
    let totalValue = res[0]?.totalValue || 0;

    const query2 = {
      tickIn: tick1,
      tickOut: tick0,
      ts: {
        $gte: Date.now() / 1000 - interval,
      },
    };
    if (address) {
      query2["address"] = address;
    }
    const res2 = await recordSwapDao.aggregate([
      {
        $match: query2,
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: "$value" },
        },
      },
    ]);
    totalValue = decimalCal([totalValue, "add", res2[0]?.totalValue || 0]);
    logger.debug({
      tag: TAG,
      msg: "aggregateVolume",
      tick0,
      tick1,
      date,
      address,
      totalValue,
      res,
      res2,
    });
    return totalValue;
  }

  async poolList(params: PoolListReq): Promise<PoolListRes> {
    const { limit, start, search } = params;

    const query = {};
    if (search) {
      query["$or"] = [
        { tick0: { $regex: search, $options: "i" } },
        { tick1: { $regex: search, $options: "i" } },
      ];
      try {
        const [tick0, tick1] = search.split("/");
        need(!!tick0);
        need(!!tick1);
        query["$or"].push({
          tick0: { $regex: tick0, $options: "i" },
          tick1: { $regex: tick1, $options: "i" },
        });
      } catch (err) {
        //
      }
    }
    const total = await poolListDao.count(query);

    let sort: any = { tvl: -1 };
    if (params.sort == "24h") {
      sort = { volume24h: -1 };
    } else if (params.sort == "7d") {
      sort = { volume7d: -1 };
    } else if (params.sort == "30d") {
      sort = { volume30d: -1 };
    }

    const list = await poolListDao.aggregate([
      { $match: query },
      {
        $sort: sort,
      },
      { $skip: start },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 0,
        },
      },
    ]);

    return {
      total,
      list,
    };
  }

  async lpRewardHistory(params: LpRewardHistoryReq) {
    const query = {
      address: params.address,
      tick0: params.tick0,
      tick1: params.tick1,
    };
    const list = await lpRewardHistoryDao.find(query, { sort: { _id: -1 } });
    const total = await lpRewardHistoryDao.count(query);

    return { total, list };
  }

  async myPool(params: MyPoolReq): Promise<MyPoolRes> {
    const { address, tick0, tick1 } = params;
    const res = await this.myPoolList({ address, start: 0, limit: 10000 });
    for (let i = 0; i < res.list.length; i++) {
      const item = res.list[i];
      if (getPairStrV2(item.tick0, item.tick1) == getPairStrV2(tick0, tick1)) {
        for (const pid in stakePoolMgr.poolMap) {
          const pool = stakePoolMgr.poolMap[pid];
          if (
            pool.tick0 == tick0 &&
            pool.tick1 == tick1 &&
            env.NewestHeight < pool.EndBlock
          ) {
            item.activedPid = pid;
            break;
          }
        }
        return item;
      }
    }

    const pair = getPairStrV2(params.tick0, params.tick1);
    operator.PendingSpace.LpReward.settlement(pair, params.address);
    const res2 = operator.PendingSpace.LpReward.UserMap[pair]?.[params.address];
    return {
      lpUSD: "0",
      lp: "0",
      lockedLp: "0",
      shareOfPool: "0",
      tick0: res2.tick0,
      tick1: res2.tick1,
      amount0: "0",
      amount1: "0",

      claimedReward0: res2?.claimedReward0 || "0",
      claimedReward1: res2?.claimedReward1 || "0",
      unclaimedReward0: res2?.unclaimedReward0 || "0",
      unclaimedReward1: res2?.unclaimedReward1 || "0",
    };
  }

  async myPoolList(params: MyPoolListReq) {
    const { address, tick: search, limit, start, sortField, sortType } = params;
    const swapAssets = operator.PendingSpace.Assets.dataRefer()["swap"];
    const lockAssets = operator.PendingSpace.Assets.dataRefer()["lock"];
    let list: MyPoolListItem[] = [];
    const pools: any[] = [];
    for (const pair in swapAssets) {
      if (
        isLp(pair) &&
        (bn(swapAssets[pair].balanceOf(address)).gt("0") ||
          bn(lockAssets[pair]?.balanceOf(address)).gt("0"))
      ) {
        const { tick0, tick1 } = getPairStructV2(pair);
        const decimal0 = decimal.get(tick0);
        const decimal1 = decimal.get(tick1);

        const myLp = decimalCal([
          swapAssets[pair].balanceOf(address),
          "add",
          lockAssets[pair]?.balanceOf(address) || "0",
        ]);
        const myLockedLp = lockAssets[pair]?.balanceOf(address) || "0";
        const poolLp = getPoolLp(operator.PendingSpace, pair);
        const poolAmount0 = swapAssets[tick0].balanceOf(pair);
        const poolAmount1 = swapAssets[tick1].balanceOf(pair);

        operator.PendingSpace.LpReward.settlement(pair, params.address);
        const res =
          operator.PendingSpace.LpReward.UserMap[pair]?.[params.address];

        const shareOfPool = decimalCal([myLp, "div", poolLp]);
        if (isMatch(pair, search)) {
          const data = {
            lpUSD: "0",
            lp: bnDecimal(myLp, LP_DECIMAL),
            lockedLp: bnDecimal(myLockedLp, LP_DECIMAL),
            shareOfPool,
            tick0,
            tick1,
            amount0: bnDecimal(
              decimalCal([poolAmount0, "mul", shareOfPool], decimal0),
              decimal0
            ),
            amount1: bnDecimal(
              decimalCal([poolAmount1, "mul", shareOfPool], decimal1),
              decimal1
            ),

            claimedReward0: res?.claimedReward0 || "0",
            claimedReward1: res?.claimedReward1 || "0",
            unclaimedReward0: res?.unclaimedReward0 || "0",
            unclaimedReward1: res?.unclaimedReward1 || "0",
          };
          const lpUSD = decimalCal(
            [
              (await query.getTickPrice(res.tick0)) * parseFloat(data.amount0) +
                (await query.getTickPrice(res.tick1)) *
                  parseFloat(data.amount1),
            ],
            "6"
          );
          data.lpUSD = lpUSD;
          list.push(data);
          pools.push({
            tick0,
            tick1,
          });
        }
      }
    }

    const poolList =
      pools.length > 0
        ? await poolListDao.find({
            $or: pools,
          })
        : [];

    list = list.filter((item) => {
      return (
        !item.tick0.toLowerCase().includes("unisat_") &&
        !item.tick1.toLowerCase().includes("unisat_")
      );
    });

    list.forEach((item) => {
      const data = poolList.find(
        (pool) => pool.tick0 === item.tick0 && pool.tick1 === item.tick1
      );
      if (data) {
        item.tvl = data.tvl;
        item.volume24h = data.volume24h;
        item.volume7d = data.volume7d;
        item.volume30d = data.volume30d;
      } else {
        item.tvl = 0;
        item.volume24h = 0;
        item.volume7d = 0;
        item.volume30d = 0;
      }
    });
    if (sortField === "liq") {
      list.sort((a, b) =>
        sortType === "desc"
          ? parseFloat(b.lpUSD) - parseFloat(a.lpUSD)
          : parseFloat(a.lpUSD) - parseFloat(b.lpUSD)
      );
    } else if (sortField === "tvl") {
      list.sort((a, b) =>
        sortType === "desc" ? b.tvl - a.tvl : a.tvl - b.tvl
      );
    } else if (sortField === "24h") {
      list.sort((a, b) =>
        sortType === "desc"
          ? b.volume24h - a.volume24h
          : a.volume24h - b.volume24h
      );
    } else if (sortField === "7d") {
      list.sort((a, b) =>
        sortType === "desc" ? b.volume7d - a.volume7d : a.volume7d - b.volume7d
      );
    } else if (sortField === "30d") {
      list.sort((a, b) =>
        sortType === "desc"
          ? b.volume30d - a.volume30d
          : a.volume30d - b.volume30d
      );
    }

    const totalLpUSD = list.reduce((acc, item) => {
      return decimalCal([acc, "add", item.lpUSD]);
    }, "0");
    return {
      total: list.length,
      totalLpUSD,
      list: list.slice(start, start + limit),
    };
  }

  async overview(params: OverViewReq): Promise<OverViewRes> {
    const res = await poolListDao.aggregate([
      {
        $match: {
          tvl: { $gt: MIN_TVL },
        },
      },
      {
        $group: {
          _id: null,
          totalTvl: { $sum: "$tvl" },
          totalVolume24h: { $sum: "$volume24h" },
          totalVolume7d: { $sum: "$volume7d" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          totalTvl: { $toString: "$totalTvl" },
          totalVolume24h: { $toString: "$totalVolume24h" },
          totalVolume7d: { $toString: "$totalVolume7d" },
          count: "$count",
        },
      },
    ]);

    const transactions = await recordGasDao.count({
      ts: { $gt: Date.now() / 1000 - 24 * 3600 },
    });

    const item = res[0];
    const pairs = await poolListDao.count({});

    return {
      liquidity: item?.totalTvl || "0",
      volume7d: item?.totalVolume7d || "0",
      volume24h: item?.totalVolume24h || "0",
      transactions,
      pairs,
    };
  }

  async gasHistory(params: GasHistoryReq): Promise<GasHistoryRes> {
    const { address, limit, start } = params;
    const query = {};
    if (address) {
      query["address"] = address;
    }
    const total = await recordGasDao.count(query);
    const list = await recordGasDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async sendHistory(params: SendHistoryReq): Promise<SendHistoryRes> {
    const { address, tick, fuzzySearch, limit, start } = params;
    const query = {};
    if (address) {
      query["$or"] = [{ address }, { to: address }];
    }
    if (tick) {
      if (fuzzySearch) {
        // Enable fuzzy matching for tick symbols, e.g., searching “fb” will match “sFB___000”.
        const regex = new RegExp(tick, "i"); // Case-insensitive
        query["tick"] = regex;
      } else {
        query["tick"] = tick;
      }
    }
    query["isLp"] = { $ne: true }; // only query non-LP sends
    const total = await recordSendDao.count(query);
    const list = await recordSendDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async sendLpHistory(params: SendLpHistoryReq): Promise<SendLpHistoryRes> {
    const { address, fuzzySearch, limit, start } = params;
    const query = {
      $or: [
        {
          address,
          to: { $ne: ZERO_ADDRESS },
          isLp: true,
        },
        {
          to: address,
          isLp: true,
        },
      ],
    };
    let tick = params.tick;
    if (tick) {
      const [tick0, tick1] = tick.split("/");
      tick = getPairStrV1(tick0, tick1);
      if (fuzzySearch) {
        query["tick"] = new RegExp(tick, "i");
      } else {
        query["tick"] = tick;
      }
    }
    const total = await recordSendDao.count(query);
    const list = await recordSendDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0 },
    });
    const items = list.map((item) => ({
      address: item.address,
      to: item.to,
      tick: item.tick,
      amount: item.amount,
      ts: item.ts,
      sendLpResult: item.sendLpResult ?? {
        amount0: "0",
        amount1: "0",
        lp: item.amount,
        value: 0,
      },
    }));
    return { total, list: items };
  }

  async burnHistory(params: BurnHistoryReq): Promise<BurnHistoryRes> {
    const { address, fuzzySearch, limit, start } = params;
    const query = {};
    if (address) {
      query["address"] = address;
    }
    query["to"] = ZERO_ADDRESS;
    let tick = params.tick;
    if (tick) {
      const [tick0, tick1] = tick.split("/");
      tick = getPairStrV1(tick0, tick1);
      if (fuzzySearch) {
        // Enable fuzzy matching for tick symbols, e.g., searching “fb” will match “sFB___000”.
        const regex = new RegExp(tick, "i"); // Case-insensitive
        query["tick"] = regex;
      } else {
        query["tick"] = tick;
      }
    }
    query["isLp"] = true; // only query LP sends
    const total = await recordSendDao.count(query);
    const list = await recordSendDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });
    let burnedLp = "0";
    let totalLp = "0";
    if (tick) {
      const [tick0, tick1] = tick.split("/");
      const pair = getPairStrV2(tick0, tick1);

      if (operator.PendingSpace.Assets.isExist(pair)) {
        const assets = operator.PendingSpace.Assets;

        totalLp = bnDecimal(assets.get(pair).Supply, LP_DECIMAL);
        burnedLp = bnDecimal(
          assets.get(pair).balanceOf(ZERO_ADDRESS),
          LP_DECIMAL
        );
      }
    }

    return { total, list, totalLp, burnedLp };
  }

  async liqHistory(params: LiqHistoryReq): Promise<LiqHistoryRes> {
    const { address, type, limit, start, fuzzySearch } = params;
    let tick = params.tick;
    const query = {};
    if (address) {
      query["address"] = address;
    }
    if (tick) {
      if (tick.length > 4) {
        try {
          const res = tick.split("/");
          need(res.length == 2);
          tick = getPairStrV2(res[0], res[1]);
        } catch (err) {}
      }

      if (fuzzySearch) {
        if (isLp(tick)) {
          const { tick0, tick1 } = getPairStructV2(tick);
          query["tick0"] = tick0;
          query["tick1"] = tick1;
        } else if (!tick.includes("/")) {
          // Handle fuzzy matching for individual ticks, such as searching for “fb” to match “sFB___000”.
          const regex = new RegExp(tick, "i"); // Case-insensitive
          query["$or"] = [{ tick0: regex }, { tick1: regex }];
        }
      } else {
        if (isLp(tick)) {
          const { tick0, tick1 } = getPairStructV2(tick);
          query["tick0"] = tick0;
          query["tick1"] = tick1;
        } else if (!tick.includes("/")) {
          query["$or"] = [{ tick0: tick }, { tick1: tick }];
        }
      }
    }
    if (type) {
      query["type"] = type;
    }
    const total = await recordLiqDao.count(query);
    const list = await recordLiqDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async swapHistory(params: SwapHistoryReq): Promise<SwapHistoryRes> {
    const { address, tick, fuzzySearch, limit, start } = params;
    const query = {};
    if (address) {
      query["address"] = address;
    }

    if (tick) {
      if (fuzzySearch) {
        if (tick.includes("/")) {
          // Handle fuzzy matching for trading pair formats, such as “mooncats/fb” matching “MoonCats/sFB___000”
          const [tick0, tick1] = tick.split("/");
          const regex0 = new RegExp(tick0, "i"); // Case-insensitive
          const regex1 = new RegExp(tick1, "i"); // Case-insensitive

          query["$or"] = [
            { tickIn: regex0, tickOut: regex1 },
            { tickIn: regex1, tickOut: regex0 },
          ];
        } else {
          // Handling fuzzy matching for individual ticks, such as “fb” matching “sFB___000”
          const regex = new RegExp(tick, "i"); // Case-insensitive
          query["$or"] = [{ tickIn: regex }, { tickOut: regex }];
        }
      } else {
        if (tick.includes("/")) {
          const [tick0, tick1] = tick.split("/");
          query["$or"] = [
            { tickIn: tick0, tickOut: tick1 },
            { tickIn: tick1, tickOut: tick0 },
          ];
        } else {
          query["$or"] = [{ tickIn: tick }, { tickOut: tick }];
        }
      }
    }

    // Use cached estimated count for better performance
    const queryKey = JSON.stringify(params);
    const cached = this.countCache.get(queryKey);
    let total: number;

    if (cached && Date.now() - cached.timestamp < this.COUNT_CACHE_TTL) {
      total = cached.count;
    } else {
      total = await recordSwapDao.count(query);
      this.countCache.set(queryKey, { count: total, timestamp: Date.now() });
    }
    const list = await recordSwapDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async multiSwapHistory(params: SwapHistoryReq): Promise<MultiSwapHistoryRes> {
    const { address, tick, fuzzySearch, limit, start } = params;
    const query = {};
    if (address) {
      query["address"] = address;
    }

    if (tick) {
      if (fuzzySearch) {
        if (tick.includes("/")) {
          const [tick0, tick1] = tick.split("/");
          const regex0 = new RegExp(tick0, "i");
          const regex1 = new RegExp(tick1, "i");
          query["$or"] = [
            { tickIn: regex0, tickOut: regex1 },
            { tickIn: regex1, tickOut: regex0 },
          ];
        } else {
          const regex = new RegExp(tick, "i"); // Case-insensitive
          query["$or"] = [{ tickIn: regex }, { tickOut: regex }];
        }
      } else {
        if (tick.includes("/")) {
          const [tick0, tick1] = tick.split("/");
          query["$or"] = [
            { tickIn: tick0, tickOut: tick1 },
            { tickIn: tick1, tickOut: tick0 },
          ];
        } else {
          query["$or"] = [{ tickIn: tick }, { tickOut: tick }];
        }
      }
    }

    const totalKey = `record-multi-swap-${JSON.stringify(params)}`;
    let total: number;
    if (!this.cache[totalKey]) {
      total = await recordMultiSwapDao.count(query);
      this.cache[totalKey] = {
        data: total,
        intervalMs: 60_000,
        timestamp: Date.now(),
      };
    } else {
      total = this.cache[totalKey].data;
    }
    const list = await recordMultiSwapDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0 },
    });

    return { total, list };
  }

  async rollUpHistory(params: RollUpHistoryReq): Promise<RollUpHistoryRes> {
    const { limit, start } = params;

    const res1 = await opCommitDao.findNotInIndexer();
    let list1: RollUpHistoryItem[] = [];
    if (start == 0) {
      res1.forEach((item) => {
        list1.push({
          txid: item.txid ?? null,
          height: item.txid ? UNCONFIRM_HEIGHT : null,
          inscriptionId: item.inscriptionId ?? null,
          transactionNum: item.op.data.length,
          inscriptionNumber: null,
          ts: null,
          inscriptionFuncItems: item.op.data.map((d) => ({
            id: d.id,
            addr: d.addr,
            func: d.func,
            params: d.params,
            ts: d.ts,
            tag:
              d.func == FuncType.send &&
              env.ModuleInitParams.gas_to == d.params[0] &&
              "sFB___000" == d.params[1]
                ? "rollup"
                : undefined,
          })),
        });
      });
      list1 = list1.reverse();
    }

    const query = {
      "op.op": "commit",
    };
    const startIndex = await opEventDao.count(query);
    const total = startIndex + res1.length;
    const res2 = await opEventDao.find(query, {
      limit: limit,
      skip: start,
      sort: { _id: -1 },
    });
    const list2: RollUpHistoryItem[] = res2.map((item, i) => {
      return {
        cursor: startIndex - start - i,
        txid: item.txid,
        height: item.height,
        transactionNum: (item.op as CommitOp).data.length,
        inscriptionId: item.inscriptionId,
        inscriptionNumber: item.inscriptionNumber,
        ts: item.blocktime,
        inscriptionFuncItems: (item.op as CommitOp).data.map((d) => ({
          id: d.id,
          addr: d.addr,
          func: d.func,
          params: d.params,
          ts: d.ts,
          tag:
            d.func == FuncType.send &&
            env.ModuleInitParams.gas_to == d.params[0] &&
            "sFB___000" == d.params[1]
              ? "rollup"
              : undefined,
        })),
      };
    });
    const list = list1.concat(list2);
    const lockIdList: string[] = list.flatMap((rollItem) =>
      rollItem.inscriptionFuncItems
        .filter((item) => item.func == FuncType.lock)
        .map((item) => item.id)
    );
    const unlockIdList: string[] = list.flatMap((rollItem) =>
      rollItem.inscriptionFuncItems
        .filter((item) => item.func == FuncType.unlock)
        .map((item) => item.id)
    );
    const lockList =
      lockIdList.length > 0
        ? await recordLockLpDao.find({ id: { $in: lockIdList } })
        : [];
    const unLockList =
      unlockIdList.length > 0
        ? await recordUnlockLpDao.find({ id: { $in: unlockIdList } })
        : [];
    list.forEach((rollItem) => {
      const { inscriptionFuncItems } = rollItem;
      inscriptionFuncItems.forEach((item) => {
        const { id, func } = item;
        if (func == FuncType.lock) {
          const data = lockList.find((ret) => ret.id == id);
          if (data) {
            item.tag = "lpLock";
            item.lockDay = data.lockDay;
          }
        } else if (func == FuncType.unlock) {
          const data = unLockList.find((ret) => ret.id == id);
          if (data) {
            item.tag = "lpLock";
          }
        }
      });
    });
    return { total, list };
  }

  async depositHistoryItem(params: DepositProcessReq) {
    const res = await this.depositHistory({
      txid: params.txid,
      start: 0,
      limit: 1,
    });
    let ret: DepositProcessRes = {
      ...res.list[0],
    };
    return ret;
  }

  async depositHistory(params: DepositListReq) {
    const query = {};
    if (params.address) {
      let address = params.address;
      let arr = [address];
      if (params.pubkey) {
        address = getAddress(
          getAddressType(address),
          params.pubkey,
          process.env.BITCOIN_NETWORK as NetworkType
        );
        arr.push(address);
        query["address"] = { $in: arr };
      } else {
        query["address"] = { $in: arr };
      }
    }
    if (params.tick) {
      query["tick"] = params.tick;
    }
    if (params.txid) {
      query["txid"] = params.txid;
    }

    const res = await depositDao.find(query, {
      limit: params.limit,
      skip: params.start,
      sort: { _id: -1 },
    });
    let total = await depositDao.count(query);
    let list: DepositListItem[] = [];
    for (let i = 0; i < res.length; i++) {
      const item = res[i];

      if (item.height == UNCONFIRM_HEIGHT || !item.ts) {
        try {
          const info = await api.txInfo(item.txid);
          item.height = info.height;
          item.ts = info.timestamp;
          if (item.height !== UNCONFIRM_HEIGHT && item.ts) {
            await depositDao.upsertDataByInscriptionId(item);
          }
        } catch (err) {
          //
        }
      }

      let totalPending = 0;
      let confirmNum = 0;
      let tick = item.tick;
      let txid = item.txid;
      let status = DepositItemStatus.pending;
      let originNetworkType = process.env.BITCOIN_NETWORK as NetworkType;
      let originTick = item.tick;
      let originAssetType: AssetType = "brc20";

      if (item.type == "direct") {
        totalPending = config.pendingDepositDirectNum;
        confirmNum = Math.max(
          0,
          Math.min(heightConfirmNum(item.height), totalPending)
        );
      } else if (item.type == "matching") {
        totalPending = config.pendingDepositMatchingNum;
        confirmNum = Math.max(
          0,
          Math.min(heightConfirmNum(item.height), totalPending)
        );
      } else if (item.type == "bridge") {
        originNetworkType = getL1NetworkType(item.tick);
        const bridgeHistoryParams: BridgeHistoryReq = {
          address: item.address,
          type: "deposit",
          txids: [item.txid],
          start: 0,
          limit: params.limit,
          bridgeType: "all",
        };
        const bridgeHistoryRes = await api.bridgeHistory(
          bridgeHistoryParams,
          originNetworkType
        );
        if (bridgeHistoryRes.list.length == 0) {
          logger.error({
            tag: TAG,
            msg: "bridgeHistory",
            params,
            bridgeHistoryParams,
            bridgeHistoryRes,
          });
        }
        const bridgeItem = bridgeHistoryRes.list[0];
        if (bridgeItem) {
          totalPending = bridgeItem.needConfirmations;
          confirmNum = bridgeItem.curConfirmations;
          if (confirmNum >= totalPending && bridgeItem.status !== "success") {
            confirmNum = totalPending - 1;
          }
          tick = bridgeItem.receiveTick;
          txid = bridgeItem.payTxid;
          originAssetType = bridgeItem.l1AssetType;
          originTick = bridgeItem.payTick;
        }
      }

      if (confirmNum >= totalPending) {
        status = DepositItemStatus.success;
        confirmNum = totalPending;
      }

      list.push({
        tick,
        amount: item.amount,
        cur: confirmNum,
        sum: totalPending,
        ts: item.ts,
        txid,
        type: item.type,
        originNetworkType,
        status,
        originTick,
        originAssetType,
      });
    }
    return { list, total };
  }

  async withdrawHistory(
    params: WithdrawHistoryReq
  ): Promise<WithdrawHistoryRes> {
    const { start, limit, tick, pubkey } = params;
    let address = params.address;
    if (pubkey) {
      address = getAddress(
        getAddressType(address),
        pubkey,
        process.env.BITCOIN_NETWORK as NetworkType
      );
    }
    const query = {
      address,
    };
    if (tick) {
      query["tick"] = tick;
    }
    const total = await withdrawDao.count(query);
    const res = await withdrawDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
    });
    const list: ConditionalWithdrawHistoryItem[] = [];
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      let completedAmount = "0";
      const type = item.type || "conditional";

      let rollUpTotalNum = config.pendingRollupNum;
      let approveTotalNum = config.pendingWithdrawNum;
      let rollUpConfirmNum = Math.min(
        rollUpTotalNum,
        getConfirmedNum(item.rollUpHeight)
      );
      let approveConfirmNum = Math.min(
        approveTotalNum,
        getConfirmedNum(item.approveHeight)
      );
      let totalConfirmedNum = Math.max(0, rollUpConfirmNum + approveConfirmNum);
      let totalNum = config.pendingRollupNum + config.pendingWithdrawNum;
      let status = item.status;
      let originNetworkType = process.env.BITCOIN_NETWORK as NetworkType;
      let originTick = item.tick;
      let originAssetType: AssetType = "brc20";

      if (type == "conditional") {
        let approve = matching.getApproveMatching(item.inscriptionId);
        if (approve) {
          completedAmount = decimalCal([
            item.amount,
            "sub",
            approve.remainAmount,
          ]);
        }
      } else if (type == "direct") {
        if (item.status == "order") {
          completedAmount = item.amount;
        }
      } else if (type == "bridge") {
        try {
          const funcId = item.id;
          const networkType = getL1NetworkType(item.tick);
          const txItem = await api.bridgeTxStatus(
            { type: "withdraw", txid: funcId },
            networkType
          );
          totalConfirmedNum = txItem.curConfirmations;
          totalNum = txItem.needConfirmations;
          if (txItem.status == "success") {
            status = "completed";
          }
          if (txItem.status == "fail") {
            status = "error";
          }

          if (status == "order") {
            completedAmount = item.amount;
          }
          originNetworkType = networkType;
          originTick = l2ToL1TickName(item.tick);
          originAssetType = getL1AssetType(item.tick);
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "bridgeTxStatus",
            err,
            item,
          });
        }
      }

      list.push({
        id: item.id,
        tick: item.tick,
        totalAmount: item.amount,
        completedAmount,
        ts: item.ts,
        totalConfirmedNum,
        totalNum,
        status,
        type: item.type,
        originNetworkType,
        originTick,
        originAssetType,
      });
    }

    return { total, list };
  }

  async withdrawProcess(
    params: WithdrawProcessReq
  ): Promise<WithdrawProcessRes> {
    const { id } = params;
    const item = directWithdraw.getByOrderId(id);

    need(item.rollUpHeight >= 0);
    need(item.approveHeight >= 0);

    const rollUpTotalNum = config.pendingRollupNum;
    const withdrawTotalNum = config.pendingWithdrawNum;

    const rollUpConfirmNum = Math.min(
      rollUpTotalNum,
      getConfirmedNum(item.rollUpHeight)
    );
    const withdrawConfirmNum = Math.min(
      withdrawTotalNum,
      getConfirmedNum(item.approveHeight)
    );
    const totalConfirmedNum = rollUpConfirmNum + withdrawConfirmNum;
    const totalNum = config.pendingRollupNum + config.pendingWithdrawNum;

    const cancelTotalNum = config.pendingWithdrawNum;
    const cancelConfirmedNum = Math.min(
      cancelTotalNum,
      getConfirmedNum(item.cancelHeight)
    );

    const matchHistory = await matchingDao.find({
      approveInscriptionId: item.inscriptionId,
    });

    let completedAmount = "0";
    let approve = matching.getApproveMatching(item.inscriptionId);
    if (approve) {
      completedAmount = decimalCal([item.amount, "sub", approve.remainAmount]);
    }

    const ret: WithdrawProcessRes = {
      type: item.type,
      id: item.id,
      tick: item.tick,
      amount: item.amount,
      ts: item.ts,
      totalConfirmedNum,
      totalNum,
      rollUpConfirmNum,
      rollUpTotalNum,
      cancelConfirmedNum,
      cancelTotalNum,
      approveConfirmNum: withdrawConfirmNum,
      approveTotalNum: withdrawTotalNum,
      rollUpTxid: item.rollUpTxid,
      paymentTxid: item.paymentTxid,
      inscribeTxid: item.inscribeTxid,
      approveTxid: item.approveTxid,
      completedAmount,
      matchHistory,
      status: item.status,
      rank: matching.getWithdrawRanking(item.address, item.tick),
    };
    return ret;
  }

  async getAllBalance(
    req: AllAddressBalanceReq
  ): Promise<AllAddressBalanceRes> {
    const cacheTime = 1000;
    // Check memory cache first (1 second cache)
    const cacheKey = `balance_${req.address}`;
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey].data;
    }

    // Try to get balance from cache table first
    try {
      const cachedBalance = await global.addressBalanceDao.findAddressBalance(
        req.address
      );
      if (cachedBalance) {
        for (let tick in cachedBalance.balance) {
          cachedBalance.balance[tick].price = await this.getTickPrice(tick);
        }

        // Store in memory cache
        this.cache[cacheKey] = {
          data: cachedBalance.balance,
          intervalMs: cacheTime,
          timestamp: Date.now(),
        };
        return cachedBalance.balance;
      }
    } catch (error) {
      global.logger.warn({
        tag: "Query.getAllBalance",
        msg: `Failed to get balance from cache table for address ${req.address}`,
        error,
      });
    }

    // If no cached data, try to update the address balance first
    try {
      global.logger.info({
        tag: "Query.getAllBalance",
        msg: `No cached balance found for address ${req.address}, attempting to update...`,
      });

      await global.addressBalanceWorker.updateAddressBalance(req.address);

      // Try to get the updated balance from cache table again
      const updatedBalance = await global.addressBalanceDao.findAddressBalance(
        req.address
      );
      if (updatedBalance) {
        // Store in memory cache
        this.cache[cacheKey] = {
          data: updatedBalance.balance,
          intervalMs: cacheTime,
          timestamp: Date.now(),
        };

        global.logger.info({
          tag: "Query.getAllBalance",
          msg: `Successfully retrieved updated balance for address ${req.address}`,
        });

        for (let tick in updatedBalance.balance) {
          updatedBalance.balance[tick].price = await this.getTickPrice(tick);
        }
        return updatedBalance.balance;
      }
    } catch (error) {
      global.logger.warn({
        tag: "Query.getAllBalance",
        msg: `Failed to update balance for address ${req.address}`,
        error,
      });
    }

    // If all attempts failed, return default zero balance data
    global.logger.warn({
      tag: "Query.getAllBalance",
      msg: `All balance retrieval attempts failed for address ${req.address}, returning default zero balance`,
    });

    // Store default data in memory cache to avoid repeated failed queries
    const defaultData = {};
    this.cache[cacheKey] = {
      data: defaultData,
      intervalMs: cacheTime,
      timestamp: Date.now(),
    };

    // Return default zero balance data
    return defaultData;
  }

  async poolInfo(params: PoolInfoReq): Promise<PoolInfoRes> {
    const pair = getPairStrV2(params.tick0, params.tick1);
    const { tick0, tick1 } = getPairStructV2(pair);
    const existed = operator.PendingSpace.Assets.isExist(pair);

    const res = await poolListDao.findOne({ tick0, tick1 });
    const res2: PoolListItem = {
      tick0,
      tick1,
      lp: res?.lp?.toString() || "0",
      tvl: res?.tvl?.toString() || "0",
      amount0: res?.amount0?.toString() || "0",
      amount1: res?.amount1?.toString() || "0",
      volume24h: res?.volume24h?.toString() || "0",
      volume7d: res?.volume7d?.toString() || "0",
      volume30d: res?.volume30d?.toString() || "0",
      reward0: res?.reward0?.toString() || "0",
      reward1: res?.reward1?.toString() || "0",
    };

    let activedPid: string;
    for (const pid in stakePoolMgr.poolMap) {
      const pool = stakePoolMgr.poolMap[pid];
      if (
        pool.tick0 == tick0 &&
        pool.tick1 == tick1 &&
        env.NewestHeight < pool.EndBlock
      ) {
        activedPid = pid;
        break;
      }
    }

    let marketCapTick = "";
    let marketCap = 0;

    const map = config.l1SupplyMap || {};
    if (!QUOTA_ASSETS.includes(tick0) && QUOTA_ASSETS.includes(tick1)) {
      marketCapTick = tick0;
      const supply = map[tick0] || parseFloat((await api.brc20Info(tick0)).max);
      const price = await query.getTickPrice(tick0);
      marketCap = supply * price;
    } else if (!QUOTA_ASSETS.includes(tick1) && QUOTA_ASSETS.includes(tick0)) {
      marketCapTick = tick1;
      const supply = map[tick1] || parseFloat((await api.brc20Info(tick1)).max);
      const price = await query.getTickPrice(tick1);
      marketCap = supply * price;
    }

    const asset0Info = env.assetList.find((item) => item.l2Tick == tick0);
    const asset1Info = env.assetList.find((item) => item.l2Tick == tick1);
    const tick0Info = await addressBalanceWorker.getTickInfo(tick0);
    const tick1Info = await addressBalanceWorker.getTickInfo(tick1);
    if (!existed) {
      return {
        existed,
        addLiq: false,
        activedPid,
        marketCap,
        marketCapTick,
        ...res2,
        networkType0: asset0Info
          ? asset0Info.l1NetworkType
          : tick0Info
          ? tick0Info.networkType
          : undefined,
        networkType1: asset1Info
          ? asset1Info.l1NetworkType
          : tick1Info
          ? tick1Info.networkType
          : undefined,
        assetType0: asset0Info
          ? asset0Info.l1AssetType
          : tick0Info
          ? tick0Info.assetType
          : undefined,
        assetType1: asset1Info
          ? asset1Info.l1AssetType
          : tick1Info
          ? tick1Info.assetType
          : undefined,
        l1Tick0: asset0Info ? asset0Info.l1Tick : l2ToL1TickName(tick0),
        l1Tick1: asset1Info ? asset1Info.l1Tick : l2ToL1TickName(tick1),
      };
    } else {
      const addLiq = bn(operator.PendingSpace.Assets.get(pair).Supply).gt("0");
      return {
        existed,
        addLiq,
        activedPid,
        marketCap,
        marketCapTick,
        ...res2,
        networkType0: asset0Info
          ? asset0Info.l1NetworkType
          : tick0Info
          ? tick0Info.networkType
          : undefined,
        networkType1: asset1Info
          ? asset1Info.l1NetworkType
          : tick1Info
          ? tick1Info.networkType
          : undefined,
        assetType0: asset0Info
          ? asset0Info.l1AssetType
          : tick0Info
          ? tick0Info.assetType
          : undefined,
        assetType1: asset1Info
          ? asset1Info.l1AssetType
          : tick1Info
          ? tick1Info.assetType
          : undefined,
        l1Tick0: asset0Info ? asset0Info.l1Tick : l2ToL1TickName(tick0),
        l1Tick1: asset1Info ? asset1Info.l1Tick : l2ToL1TickName(tick1),
      };
    }
  }

  async getSelect(params: SelectReq): Promise<SelectRes> {
    const { address, search } = params;
    const list = decimal.getAllTick();
    const balances = await api.brc20Summary(address);
    const balancesMap: { [tick: string]: Brc20Summary["detail"][0] } = {};
    for (let i = 0; i < balances.detail.length; i++) {
      balancesMap[balances.detail[i].ticker] = balances.detail[i];
    }

    type TickItem = {
      tick: string;
      brc20Balance: string;
      swapBalance: string;
      decimal: string;
    };
    const tickMap: { [tick: string]: TickItem } = {};
    const ret0 = list.map((tick) => {
      const brc20Balance = balancesMap[tick]?.overallBalance || "0";
      let swapBalance = bnDecimal(
        operator.PendingSpace.Assets.getBalance(address, tick),
        decimal.get(tick)
      );
      const item = {
        tick,
        brc20Balance,
        swapBalance,
        decimal: decimal.get(tick),
      } as TickItem;
      tickMap[item.tick] = item;
      return item;
    });
    const res1 = _.cloneDeep(ret0).sort((a, b) => {
      return parseFloat(b.swapBalance) - parseFloat(a.swapBalance);
    });
    const res2 = _.cloneDeep(ret0).sort((a, b) => {
      return parseFloat(b.brc20Balance) - parseFloat(a.brc20Balance);
    });
    let ret: SelectRes = [];

    const set = new Set();
    for (let i = 0; i < res1.length; i++) {
      if (res1[i].swapBalance !== "0") {
        if (!set.has(res1[i].tick)) {
          ret.push(res1[i]);
          set.add(res1[i].tick);
        }
      } else {
        break;
      }
    }
    for (let i = 0; i < res2.length; i++) {
      if (res2[i].brc20Balance !== "0") {
        if (!set.has(res2[i].tick)) {
          ret.push(res2[i]);
          set.add(res2[i].tick);
        }
      } else {
        break;
      }
    }

    const res3 = await query.poolList({
      sort: "7d",
      start: 0,
      limit: 100,
    });
    for (let i = 0; i < res3.list.length; i++) {
      const item = res3.list[i];
      if (!set.has(item.tick0)) {
        ret.push(tickMap[item.tick0]);
        set.add(item.tick0);
      }
      if (!set.has(item.tick1)) {
        ret.push(tickMap[item.tick1]);
        set.add(item.tick1);
      }
    }

    // others
    for (let i = 0; i < res2.length; i++) {
      if (!set.has(res2[i].tick)) {
        ret.push(res2[i]);
        set.add(res2[i].tick);
      }
    }

    if (search) {
      ret = ret.filter((a) => {
        return isMatch(a.tick, search);
      });
    }
    if (config.filterTicks) {
      ret = ret.filter((a) => {
        for (let i = 0; i < config.filterTicks.length; i++) {
          if (
            a.tick.toLowerCase().includes(config.filterTicks[i].toLowerCase())
          ) {
            if (config.whitelistTick[a.tick]) {
              return true;
            } else {
              return false;
            }
          }
        }
        return true;
      });
    }

    ret = ret.filter((a) => {
      try {
        checkTick(a.tick);
        return true;
      } catch (err) {
        return false;
      }
    });
    return ret.slice(0, 20);
  }

  async getSelectPool(params: SelectPoolReq): Promise<SelectPoolRes> {
    const { address, tickIn, tickOut, search } = params;
    if ((!tickIn && !tickOut) || search) {
      return await this.getSelect({ address, search });
    }
    need(!!tickIn || !!tickOut);
    const balances = await api.brc20Summary(address);
    const balancesMap: { [tick: string]: Brc20Summary["detail"][0] } = {};
    for (let i = 0; i < balances.detail.length; i++) {
      balancesMap[balances.detail[i].ticker] = balances.detail[i];
    }

    type TickItem = {
      tick: string;
      brc20Balance: string;
      swapBalance: string;
      decimal: string;
      routes?: string[];
    };
    const tick = tickIn ? tickIn : tickOut;
    const poolList = await poolListDao.find({
      $or: [{ tick0: tick }, { tick1: tick }],
    });

    const res: SelectPoolRes = [];
    const tickMap: { [tick: string]: TickItem } = {};
    for (const pool of poolList) {
      const { tick0, tick1 } = pool;
      const targetTick = tick0 == tick ? tick1 : tick0;
      const brc20Balance = balancesMap[targetTick]?.overallBalance || "0";
      let swapBalance = bnDecimal(
        operator.PendingSpace.Assets.getBalance(address, targetTick),
        decimal.get(targetTick)
      );
      const item = {
        tick: targetTick,
        brc20Balance,
        swapBalance,
        decimal: decimal.get(targetTick),
      } as TickItem;
      tickMap[item.tick] = item;
      res.push(item);
    }

    const sFBMultiRoutes = multiRoutes.includesRoutes(tick)
      ? multiRoutes.getsFBRoutesWithoutTick(tick)
      : [];
    for (const targetTick of sFBMultiRoutes) {
      const brc20Balance = balancesMap[targetTick]?.overallBalance || "0";
      let swapBalance = bnDecimal(
        operator.PendingSpace.Assets.getBalance(address, targetTick),
        decimal.get(targetTick)
      );
      const item = {
        tick: targetTick,
        brc20Balance,
        swapBalance,
        decimal: decimal.get(targetTick),
        routes: multiRoutes.getMiddlewareRoute(),
      } as TickItem;
      tickMap[item.tick] = item;
      res.push(item);
    }

    const set = new Set();
    let ret: SelectPoolRes = [];
    if (res.length > 0) {
      const res1 = _.cloneDeep(res).sort((a, b) => {
        return parseFloat(b.swapBalance) - parseFloat(a.swapBalance);
      });
      const res2 = _.cloneDeep(res).sort((a, b) => {
        return parseFloat(b.swapBalance) - parseFloat(a.swapBalance);
      });
      for (const item of res1) {
        if (set.has(item.tick)) {
          continue;
        }
        ret.push(item);
        set.add(item.tick);
      }
      for (const item of res2) {
        if (set.has(item.tick)) {
          continue;
        }
        ret.push(item);
        set.add(item.tick);
      }
      if (config.filterTicks) {
        ret = ret.filter((a) => {
          for (let i = 0; i < config.filterTicks.length; i++) {
            if (
              a.tick.toLowerCase().includes(config.filterTicks[i].toLowerCase())
            ) {
              return !!config.whitelistTick[a.tick];
            }
          }
          return true;
        });
      }
      ret = ret.filter((a) => {
        try {
          checkTick(a.tick);
          return true;
        } catch (err) {
          return false;
        }
      });
    }
    return ret;
  }

  async tick() {
    for (let tick in PRICE_TICKER_MAP) {
      try {
        const info = await api.coinmarketcapPriceInfo(tick);
        logger.info({
          tag: TAG,
          msg: "update coinmarketcap price",
          tick,
          origin: PRICE_TICKER_MAP[tick],
          price: info.price,
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "update coinmarketcap price",
          tick,
          origin: PRICE_TICKER_MAP[tick],
          err: err.message,
        });
      }
    }

    for (let key in this.cache) {
      if (Date.now() - this.cache[key].timestamp > this.cache[key].intervalMs) {
        delete this.cache[key];
      }
    }
  }

  /**
   * Separate tick function for pool update operations
   * This runs at a different interval to avoid blocking the main tick function
   */
  async tick2() {
    try {
      await this.update();
    } catch (error) {
      logger.error({
        tag: TAG,
        msg: "tick2 update failed",
        error: error.message,
      });
    }
  }

  async init() {
    if (config.readonly) {
      return;
    }
    if (config.initiatePoolUpdate) {
      await this.update();
    }
  }

  private async __getStablePairPriceInfo(
    tick0: string,
    stableTick1: string
  ): Promise<{
    price0: number;
    tvl: number;
    poolAmount0: string;
    poolAmount1: string;
  }> {
    let price0 = 0;
    let tvl = 0;
    let poolAmount0 = "0";
    let poolAmount1 = "0";

    try {
      const assets = operator.PendingSpace.Assets;
      const pair = getPairStrV2(stableTick1, tick0);
      const decimal0 = decimal.get(tick0);
      const decimal1 = decimal.get(stableTick1);

      poolAmount0 = assets.get(tick0)?.balanceOf(pair) || "0";
      poolAmount1 = assets.get(stableTick1)?.balanceOf(pair) || "0";
      if (poolAmount0 == "0" || poolAmount1 == "0") {
        //
      } else {
        const price1Info = await api.coinmarketcapPriceInfo(stableTick1);
        const price1 = price1Info.price;
        if (price1 > 0) {
          const value = decimalCal(
            [bnDecimal(poolAmount1, decimal1), "mul", price1],
            PRICE_DECIMAL
          );
          tvl = parseFloat(decimalCal([value, "mul", 2], PRICE_DECIMAL));
          price0 = parseFloat(
            decimalCal(
              [value, "div", bnDecimal(poolAmount0, decimal0)],
              PRICE_DECIMAL
            )
          );
        }
      }
    } catch (err) {
      //
    }
    return {
      price0,
      tvl,
      poolAmount0,
      poolAmount1,
    };
  }
  /**
   *
   * Assuming there is an A/B trading pair, calculate the price of A:

    1. If CoinMarketCap has a price for A, directly obtain the price.
    2. Extract the trading pairs with larger TVL from A/sats, A/FB, etc., and calculate the price of A.
    3. Otherwise, return 0.
   */
  async getCurTick0Price(tick0: string, tick1: string): Promise<number> {
    const key = `tick0:${tick0},tick1:${tick1}`;
    if (this.cache[key]) {
      return this.cache[key].data;
    }

    let ret: number;

    const res = await api.coinmarketcapPriceInfo(tick0);
    if (res.price > 0) {
      logger.debug({
        tag: TAG,
        msg: "getCurTick0Price 1",
        tick0,
        tick1,
        price: res.price,
      });
      ret = res.price;
    } else {
      let maxTvl = 0;
      let price0 = 0;

      const assets = operator.PendingSpace.Assets;
      const pair = getPairStrV2(tick1, tick0);
      const poolAmount0 = assets.get(tick0)?.balanceOf(pair) || "0";

      for (let tick2 in PRICE_TICKER_MAP) {
        const res = await this.__getStablePairPriceInfo(tick0, tick2);
        if (
          res.tvl > maxTvl &&
          // res.tvl >= MIN_TVL &&
          // The trading pair with a large TVL must have a thick pool itself
          parseFloat(poolAmount0) / parseFloat(res.poolAmount0) < 1
        ) {
          price0 = res.price0;
          maxTvl = res.tvl;
        }
      }
      if (price0 == 0) {
        // First estimate the value of the tick on the right, then convert the price on the left according to the principle of equivalent value.
        const assets = operator.PendingSpace.Assets;
        const poolAmount0 = assets.get(tick0)?.balanceOf(pair);
        const poolAmount1 = assets.get(tick1)?.balanceOf(pair);
        const decimal0 = decimal.get(tick0);
        const decimal1 = decimal.get(tick1);
        if (poolAmount0 == "0" || poolAmount1 == "0") {
          //
        } else {
          const coinmarketCapTicks = Object.keys(PRICE_TICKER_MAP);
          if (coinmarketCapTicks.includes(tick1)) {
            const price1 = await this.getCurTick0Price(tick1, DEFAULT_GAS_TICK);
            if (price1) {
              price0 = parseFloat(
                decimalCal([
                  bnDecimal(poolAmount1, decimal1),
                  "mul",
                  price1,
                  "div",
                  bnDecimal(poolAmount0, decimal0),
                ])
              );
            }
          }
        }
      }
      logger.debug({
        tag: TAG,
        msg: "getCurTick0Price 2",
        tick0,
        tick1,
        price: res.price,
      });
      ret = price0;
    }

    this.cache[key] = {
      data: ret,
      intervalMs: 10_000,
      timestamp: Date.now(),
    };
    return ret;
  }

  private async calPoolInfo(pair: string): Promise<PoolListItem> {
    const { tick0, tick1 } = getPairStructV2(pair);

    let poolLp = "0";
    let poolAmount0 = "0";
    let poolAmount1 = "0";

    if (operator.PendingSpace.Assets.isExist(pair)) {
      const assets = operator.PendingSpace.Assets;

      poolLp = getPoolLp(operator.PendingSpace, pair);
      poolAmount0 = assets.get(tick0).balanceOf(pair);
      poolAmount1 = assets.get(tick1).balanceOf(pair);

      poolLp = bnDecimal(poolLp, LP_DECIMAL);
      poolAmount0 = bnDecimal(poolAmount0, decimal.get(tick0));
      poolAmount1 = bnDecimal(poolAmount1, decimal.get(tick1));
    }
    let price0 = await this.getCurTick0Price(tick0, tick1);
    let price1 = await this.getCurTick0Price(tick1, tick0);

    const volume24h = await this.aggregateVolume(tick0, tick1, "24h");
    const volume7d = await this.aggregateVolume(tick0, tick1, "7d");
    const volume30d = await this.aggregateVolume(tick0, tick1, "30d");

    let tvl = "0";
    if (poolAmount0 == "0" || poolAmount1 == "0") {
      //
    } else {
      tvl = decimalCal([
        decimalCal([poolAmount0, "mul", price0]),
        "add",
        decimalCal([poolAmount1, "mul", price1]),
      ]);
    }

    const res2 = await operator.PendingSpace.LpReward.PoolMap[pair];
    return {
      tick0,
      tick1,
      amount0: poolAmount0,
      amount1: poolAmount1,
      tvl: tvl,
      volume24h: volume24h,
      volume7d: volume7d,
      volume30d: volume30d,
      lp: poolLp,
      reward0: res2?.reward0 || "0",
      reward1: res2?.reward1 || "0",
    };
  }

  async getSelectDeposit(req: SelectDepositReq): Promise<SelectDepositRes> {
    const ret: SelectDepositRes = {
      bitcoin: {
        native: [],
        brc20: [],
        runes: [],
        alkanes: [],
      },
      fractal: {
        native: [],
        brc20: [],
        runes: [],
      },
    };

    const bitcoinNetwork = process.env.L1_BITCOIN_NETWORK as NetworkType;
    const fractalNetwork = process.env.BITCOIN_NETWORK as NetworkType;

    let bitcoinAddress = req.address;
    let fractalAddress = req.address;
    if (req.pubkey) {
      bitcoinAddress = getAddress(
        getAddressType(req.address),
        req.pubkey,
        bitcoinNetwork
      );
    }

    const bitcoinNativeSummary = await api.availableBalance(
      bitcoinAddress,
      bitcoinNetwork
    );
    const bitcoinBrc20Summary = await api.brc20Summary(
      bitcoinAddress,
      bitcoinNetwork
    );
    const bitcoinRunesSummary = await api.runesSummary(
      bitcoinAddress,
      bitcoinNetwork
    );
    const bitcoinAlkanesSummary = await api.alkanesSummary(
      bitcoinAddress,
      bitcoinNetwork
    );
    const bitcoinBrc20SummaryMap: {
      [tick: string]: Brc20Summary["detail"][0];
    } = {};
    const bitcoinRunesSummaryMap: {
      [tick: string]: RunesSummary["detail"][0];
    } = {};
    const bitcoinAlkanesSummaryMap: {
      [tick: string]: AlkanesSummary["detail"][0];
    } = {};
    bitcoinBrc20Summary.detail.forEach((item) => {
      bitcoinBrc20SummaryMap[item.ticker] = item;
    });
    bitcoinRunesSummary.detail.forEach((item) => {
      bitcoinRunesSummaryMap[item.spacedRune] = item;
    });
    bitcoinAlkanesSummary.detail.forEach((item) => {
      bitcoinAlkanesSummaryMap[item.alkaneid] = item;
    });

    const fractalNativeSummary = await api.availableBalance(
      fractalAddress,
      fractalNetwork
    );
    const fractalBrc20Summary = await api.brc20Summary(
      fractalAddress,
      fractalNetwork
    );
    const fractalRunesSummary = await api.runesSummary(
      fractalAddress,
      fractalNetwork
    );
    const fractalBrc20SummaryMap: {
      [tick: string]: Brc20Summary["detail"][0];
    } = {};
    const fractalRunesSummaryMap: {
      [tick: string]: RunesSummary["detail"][0];
    } = {};
    fractalBrc20Summary.detail.forEach((item) => {
      if (parseFloat(item.overallBalance) > 0) {
        fractalBrc20SummaryMap[item.ticker] = item;
      }
    });
    fractalRunesSummary.detail.forEach((item) => {
      fractalRunesSummaryMap[item.spacedRune] = item;
    });

    try {
      let l1Tick = L1_BITCOIN_NAME;
      let l2Tick = l1ToL2TickName(l1Tick);
      let swapBalance: AddressTickBalance;
      try {
        swapBalance = operator.PendingSpace.getTickBalance(
          fractalAddress,
          l2Tick
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "getSelectDeposit",
          req,
          err: err.message,
          stack: err.stack,
        });
      }
      if (!swapBalance) {
        swapBalance = {
          module: "0",
          swap: "0",
          pendingSwap: "0",
          pendingAvailable: "0",
        };
      }
      let balance = (
        bitcoinNativeSummary.availableBalance / 100000000
      ).toString();
      let unavailableBalance = (
        bitcoinNativeSummary.unavailableBalance / 100000000
      ).toString();
      let divisibility = "8";
      ret.bitcoin.native.push({
        tick: l1Tick,
        brc20Tick: l2Tick,
        assetType: "btc",
        networkType: bitcoinNetwork,
        swapBalance,
        externalBalance: {
          balance,
          unavailableBalance,
          divisibility,
          brc20: null,
        },
      });
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "getSelectDeposit",
        req,
        err: err.message,
        stack: err.stack,
      });
    }

    for (let i = 0; i < env.assetList.length; i++) {
      const item = env.assetList[i];
      try {
        if (
          item.l1NetworkType == bitcoinNetwork &&
          item.l1AssetType == "brc20"
        ) {
          let l1Tick = item.l1Tick;
          let l2Tick = item.l2Tick;
          let info = await api.brc20Info(l1Tick, bitcoinNetwork);
          let swapBalance: AddressTickBalance;
          try {
            swapBalance = operator.PendingSpace.getTickBalance(
              fractalAddress,
              l2Tick
            );
          } catch (err) {
            logger.error({
              tag: TAG,
              msg: "getSelectDeposit",
              req,
              err: err.message,
              stack: err.stack,
            });
          }
          if (!swapBalance) {
            swapBalance = {
              module: "0",
              swap: "0",
              pendingSwap: "0",
              pendingAvailable: "0",
            };
          }
          let divisibility = info.decimal.toString();
          let balance = "0";
          let available = "0";
          let transferable = "0";
          if (bitcoinBrc20SummaryMap[l1Tick]) {
            balance = bitcoinBrc20SummaryMap[l1Tick].overallBalance;
            available = bitcoinBrc20SummaryMap[l1Tick].availableBalance;
            transferable = bitcoinBrc20SummaryMap[l1Tick].transferableBalance;
          }

          if (
            req.v == undefined &&
            config.hideSelectDepositL1Tick?.includes(l1Tick)
          ) {
            continue;
          }

          ret.bitcoin.brc20.push({
            tick: l1Tick,
            brc20Tick: l2Tick,
            assetType: "brc20",
            networkType: bitcoinNetwork,
            swapBalance,
            externalBalance: {
              balance,
              divisibility,
              brc20: {
                available,
                transferable,
              },
            },
          });
        } else if (
          item.l1NetworkType == bitcoinNetwork &&
          item.l1AssetType == "runes"
        ) {
          let l1Tick = item.l1Tick;
          let l2Tick = item.l2Tick;
          let swapBalance = operator.PendingSpace.getTickBalance(
            fractalAddress,
            l2Tick
          );
          let balance = "0";
          let divisibility;
          if (bitcoinRunesSummaryMap[l1Tick]) {
            balance = bnDecimal(
              bitcoinRunesSummaryMap[l1Tick].amount,
              bitcoinRunesSummaryMap[l1Tick].divisibility.toString()
            );
            divisibility =
              bitcoinRunesSummaryMap[l1Tick].divisibility.toString();
          }
          ret.bitcoin.runes.push({
            tick: l1Tick,
            brc20Tick: l2Tick,
            assetType: "runes",
            networkType: bitcoinNetwork,
            swapBalance,
            externalBalance: {
              balance,
              divisibility,
              brc20: null,
            },
          });
        } else if (
          item.l1NetworkType == bitcoinNetwork &&
          item.l1AssetType == "alkanes"
        ) {
          let l1Tick = item.l1Tick;
          let l2Tick = item.l2Tick;
          let swapBalance: AddressTickBalance;
          try {
            swapBalance = operator.PendingSpace.getTickBalance(
              fractalAddress,
              l2Tick
            );
          } catch (err) {
            logger.error({
              tag: TAG,
              msg: "getSelectDeposit",
              req,
              err: err.message,
              stack: err.stack,
            });
          }
          if (!swapBalance) {
            swapBalance = {
              module: "0",
              swap: "0",
              pendingSwap: "0",
              pendingAvailable: "0",
            };
          }
          let balance = "0";
          let divisibility;
          if (bitcoinAlkanesSummaryMap[l1Tick]) {
            balance = bnDecimal(
              bitcoinAlkanesSummaryMap[l1Tick].amount,
              bitcoinAlkanesSummaryMap[l1Tick].divisibility.toString()
            );
            divisibility =
              bitcoinAlkanesSummaryMap[l1Tick].divisibility.toString();
          }
          const info = await api.alkanesInfo(l1Tick, bitcoinNetwork);
          ret.bitcoin.alkanes.push({
            tick: l1Tick,
            brc20Tick: l2Tick,
            assetType: "alkanes",
            networkType: bitcoinNetwork,
            swapBalance,
            externalBalance: {
              balance,
              divisibility,
              brc20: null,
            },
            alkanesName: info.name,
          });
        }
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "getSelectDeposit",
          req,
          err: err.message,
          stack: err.stack,
        });
      }
    }

    try {
      let l1Tick = BITCOIN_NAME;
      let l2Tick = l1ToL2TickName(l1Tick);
      let swapBalance: AddressTickBalance;
      try {
        swapBalance = operator.PendingSpace.getTickBalance(
          fractalAddress,
          l2Tick
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "getSelectDeposit",
          req,
          err: err.message,
          stack: err.stack,
        });
      }
      if (!swapBalance) {
        swapBalance = {
          module: "0",
          swap: "0",
          pendingSwap: "0",
          pendingAvailable: "0",
        };
      }
      let balance = (
        fractalNativeSummary.availableBalance / 100000000
      ).toString();
      let unavailableBalance = (
        fractalNativeSummary.unavailableBalance / 100000000
      ).toString();
      let divisibility = "8";
      ret.fractal.native.push({
        tick: l1Tick,
        brc20Tick: l2Tick,
        assetType: "btc",
        networkType: fractalNetwork,
        swapBalance,
        externalBalance: {
          balance,
          unavailableBalance,
          divisibility,
          brc20: null,
        },
      });
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "getSelectDeposit",
        req,
        err: err.message,
        stack: err.stack,
      });
    }

    for (let i = 0; i < env.assetList.length; i++) {
      const item = env.assetList[i];
      try {
        if (
          item.l1NetworkType == fractalNetwork &&
          item.l1AssetType == "runes"
        ) {
          let l1Tick = item.l1Tick;
          let l2Tick = item.l2Tick;
          let swapBalance: AddressTickBalance;
          try {
            swapBalance = operator.PendingSpace.getTickBalance(
              fractalAddress,
              l2Tick
            );
          } catch (err) {
            logger.error({
              tag: TAG,
              msg: "getSelectDeposit",
              req,
              err: err.message,
              stack: err.stack,
            });
          }
          if (!swapBalance) {
            swapBalance = {
              module: "0",
              swap: "0",
              pendingSwap: "0",
              pendingAvailable: "0",
            };
          }
          let balance = "0";
          let divisibility = "0";
          if (fractalRunesSummaryMap[l1Tick]) {
            balance = bnDecimal(
              fractalRunesSummaryMap[l1Tick].amount,
              fractalRunesSummaryMap[l1Tick].divisibility.toString()
            );
            divisibility =
              fractalRunesSummaryMap[l1Tick].divisibility.toString();
          }
          ret.fractal.runes.push({
            tick: l1Tick,
            brc20Tick: l2Tick,
            assetType: "runes",
            networkType: fractalNetwork,
            swapBalance,
            externalBalance: {
              balance,
              divisibility,
              brc20: null,
            },
          });
        }
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "getSelectDeposit",
          req,
          err: err.message,
          stack: err.stack,
        });
      }
    }

    for (const tick in fractalBrc20SummaryMap) {
      const item = fractalBrc20SummaryMap[tick];
      try {
        const l1Tick = item.ticker;
        const l2Tick = item.ticker;
        let swapBalance: AddressTickBalance;
        try {
          swapBalance = operator.PendingSpace.getTickBalance(
            fractalAddress,
            l2Tick
          );
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "getSelectDeposit",
            req,
            err: err.message,
            stack: err.stack,
          });
        }
        if (!swapBalance) {
          swapBalance = {
            module: "0",
            swap: "0",
            pendingSwap: "0",
            pendingAvailable: "0",
          };
        }
        const info = await api.brc20Info(l1Tick, fractalNetwork);
        let divisibility = info.decimal.toString();
        let balance = "0";
        let available = "0";
        let transferable = "0";
        if (item) {
          balance = item.overallBalance;
          available = item.availableBalance;
          transferable = item.transferableBalance;
        }
        ret.fractal.brc20.push({
          tick: l1Tick,
          brc20Tick: l2Tick,
          assetType: "brc20",
          networkType: fractalNetwork,
          swapBalance,
          externalBalance: {
            balance,
            divisibility,
            brc20: {
              available,
              transferable,
            },
          },
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "getSelectDeposit",
          req,
          err: err.message,
          stack: err.stack,
        });
      }
    }
    return ret;
  }

  async getTickPrice(tick: string): Promise<number> {
    const price = await this.getCurTick0Price(tick, DEFAULT_GAS_TICK);
    return price;
  }

  async getAddressGas(params: AddressGasReq): Promise<AddressGasRes> {
    const { address, feeTick } = params;

    const res = await recordGasDao.aggregate([
      { $match: { address, tick: feeTick } },
      { $group: { _id: null, totalGas: { $sum: { $toDouble: "$gas" } } } },
    ]);

    const total = res[0]?.totalGas || 0;
    return { total };
  }

  async priceLine(params: PriceLineReq): Promise<PriceLineRes> {
    const { tick0, tick1, timeRange } = params;
    const endTime = Math.floor(Date.now() / 1000);
    let startTime = 0;
    if (timeRange == "24h") {
      startTime = endTime - 24 * 60 * 60;
    } else if (timeRange == "7d") {
      startTime = endTime - 7 * 24 * 60 * 60;
    } else if (timeRange == "30d") {
      startTime = endTime - 30 * 24 * 60 * 60;
    } else if (timeRange == "90d") {
      startTime = endTime - 90 * 24 * 60 * 60;
    } else {
      throw new Error("Invalid time range");
    }

    const swapFeeRate =
      config.swapFeeRate ?? env.ModuleInitParams.swap_fee_rate;
    const divideSwapFee = 1 - parseFloat(swapFeeRate);
    const res = await recordSwapDao.aggregate([
      {
        $match: {
          $or: [
            {
              tickIn: tick0,
              tickOut: tick1,
            },
            {
              tickIn: tick1,
              tickOut: tick0,
            },
          ],
          ts: { $gte: startTime, $lte: endTime },
          value: { $exists: true, $ne: 0 },
        },
      },
      {
        $project: {
          _id: 0,
          price: {
            $cond: {
              if: {
                $and: [
                  { $eq: ["$tickIn", tick0] },
                  { $eq: ["$tickOut", tick1] },
                ],
              },
              then: {
                $divide: [
                  { $toDouble: "$amountIn" },
                  {
                    $divide: [{ $toDouble: "$amountOut" }, divideSwapFee],
                  },
                ],
              },
              else: {
                $divide: [
                  {
                    $divide: [{ $toDouble: "$amountOut" }, divideSwapFee],
                  },
                  { $toDouble: "$amountIn" },
                ],
              },
            },
          },
          usdPrice: "$value",
          amountOut: {
            $cond: {
              if: {
                $and: [
                  { $eq: ["$tickIn", tick0] },
                  { $eq: ["$tickOut", tick1] },
                ],
              },
              then: { $toDouble: "$amountOut" },
              else: { $toDouble: "$amountIn" },
            },
          },
          ts: 1,
        },
      },
      {
        $sort: { ts: -1 },
      },
    ]);

    const interval =
      timeRange == "24h"
        ? 10 * 60
        : timeRange == "7d"
        ? 60 * 60
        : timeRange == "30d"
        ? 6 * 60 * 60
        : 24 * 60 * 60;
    const map: { [time: string]: PriceLineRes["list"][0] } = {};
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      const time = Math.floor(item.ts / interval) * interval;
      const usdPrice = item.usdPrice / item.amountOut;
      if (!map[time]) {
        map[time] = {
          price: item.price,
          usdPrice,
          ts: time,
        };
      } else {
        map[time].price = (map[time].price + item.price) / 2;
        map[time].usdPrice = (map[time].usdPrice + usdPrice) / 2;
      }
    }
    const list: PriceLineRes["list"] = [];
    for (const time in map) {
      const item = map[time];
      list.push({
        price: item.price,
        usdPrice: item.usdPrice,
        ts: item.ts,
      });
    }

    if (res[0]) {
      list.push({
        price: res[0].price,
        usdPrice: res[0].usdPrice / res[0].amountOut,
        ts: res[0].ts,
      });
    }

    list.sort((a, b) => {
      return b.ts - a.ts;
    });

    return { list, total: list.length };
  }

  async communityInfo(params: CommunityInfoReq): Promise<CommunityInfoRes> {
    const key = `communityInfo-${params.tick}`;
    if (this.cache[key]) {
      return this.cache[key].data;
    }
    const ret = communityDao.findOne({ tick: params.tick });
    this.cache[key] = {
      data: ret,
      intervalMs: 60_000,
      timestamp: Date.now(),
    };
    return ret;
  }

  async communityList(params: CommunityListReq): Promise<CommunityListRes> {
    const key = `communityList`;
    if (this.cache[key]) {
      return this.cache[key].data;
    }
    const res = await communityDao.find({});
    const ret = {
      total: res.length,
      list: res,
    };
    this.cache[key] = {
      data: ret,
      intervalMs: 60_000,
      timestamp: Date.now(),
    };
    return ret;
  }

  async tickHolders(params: TickHoldersReq): Promise<TickHoldersRes> {
    const { tick, start, limit } = params;
    const key = `tickHolders-${tick}-${start}-${limit}`;
    if (this.cache[key]) {
      return this.cache[key].data;
    }
    const ret: TickHoldersRes = {
      total: 0,
      list: [],
    };
    let totalAmount: number;
    const totalAmountKey = `tick-totalAmount-${tick}`;
    if (this.cache[totalAmountKey]) {
      totalAmount = this.cache[totalAmountKey].data;
    } else {
      const res = await assetDao.aggregate([
        {
          $match: {
            tick,
            assetType: "swap",
            address: { $ne: ZERO_ADDRESS },
            $expr: {
              $and: [
                { $gt: [{ $toDouble: "$displayBalance" }, 0] },
                { $gt: [{ $strLenCP: "$address" }, 30] },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $toDouble: "$displayBalance" } },
          },
        },
      ]);
      totalAmount = res[0]?.totalAmount || 0;
      this.cache[totalAmountKey] = {
        data: totalAmount,
        intervalMs: 60_000,
        timestamp: Date.now(),
      };
    }

    if (totalAmount > 0) {
      const rank1TotalAmountKey = `tick-rank1-totalAmount-${tick}`;
      let rank1TotalAmount: number;
      if (this.cache[rank1TotalAmountKey]) {
        rank1TotalAmount = this.cache[rank1TotalAmountKey].data;
      } else {
        const res = (await assetDao.aggregate([
          {
            $match: {
              tick,
              assetType: "swap",
              address: { $ne: ZERO_ADDRESS },
              $expr: {
                $and: [
                  { $gt: [{ $toDouble: "$displayBalance" }, 0] },
                  { $gt: [{ $strLenCP: "$address" }, 30] },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$address",
              tickBalance: { $sum: { $toDouble: "$displayBalance" } },
            },
          },
          {
            $sort: {
              tickBalance: -1,
            },
          },
          {
            $limit: 1,
          },
        ])) as { _id: string; tickBalance: number }[];
        rank1TotalAmount = res[0]?.tickBalance || 0;
        this.cache[rank1TotalAmountKey] = {
          data: rank1TotalAmount,
          intervalMs: 60_000,
          timestamp: Date.now(),
        };
      }

      const [res] = await assetDao.aggregate([
        {
          $facet: {
            data: [
              {
                $match: {
                  tick,
                  assetType: "swap",
                  address: { $ne: ZERO_ADDRESS },
                  $expr: {
                    $and: [
                      { $gt: [{ $toDouble: "$displayBalance" }, 0] },
                      { $gt: [{ $strLenCP: "$address" }, 30] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: "$address",
                  tickBalance: { $sum: { $toDouble: "$displayBalance" } },
                },
              },
              { $sort: { tickBalance: -1 } },
              { $skip: start },
              { $limit: limit },
            ],
            total: [
              {
                $match: {
                  tick,
                  assetType: "swap",
                  address: { $ne: ZERO_ADDRESS },
                  $expr: {
                    $and: [
                      { $gt: [{ $toDouble: "$displayBalance" }, 0] },
                      { $gt: [{ $strLenCP: "$address" }, 30] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: "$address",
                },
              },
              {
                $count: "total",
              },
            ],
          },
        },
      ]);

      ret.total = res.total[0]?.total || 0;
      ret.list = res.data.map((item: { _id: string; tickBalance: number }) => {
        return {
          address: item._id,
          amount: item.tickBalance.toString(),
          percentage: totalAmount == 0 ? 0 : item.tickBalance / totalAmount,
          relativePercentage:
            rank1TotalAmount == 0 ? 0 : item.tickBalance / rank1TotalAmount,
        };
      });
    }
    this.cache[key] = {
      data: ret,
      intervalMs: 60_000,
      timestamp: Date.now(),
    };
    return ret;
  }

  async poolHolders(params: PoolHoldersReq): Promise<PoolHoldersRes> {
    const { tick0, tick1, start, limit } = params;
    const key = `poolHolders-${tick0}-${tick1}-${start}-${limit}`;
    if (this.cache[key]) {
      return this.cache[key].data;
    }

    const pair = getPairStrV2(tick0, tick1);

    let res = (await assetDao.aggregate([
      {
        $match: { tick: pair },
      },
      {
        $group: {
          _id: "$address",
          lp: { $sum: { $toDouble: "$displayBalance" } },
        },
      },
      {
        $sort: { lp: -1 },
      },
      {
        $match: { lp: { $gt: 0 } },
      },
    ])) as { lp: number; _id: string }[];

    const tmp: {
      lp: number;
      _id: string;
    }[] = [];
    const { tick0: sortTick0, tick1: sortTick1 } = getPairStructV2(pair);
    const lockLpRet = await lockUserDao.aggregate([
      {
        $match: {
          tick0: sortTick0,
          tick1: sortTick1,
        },
      },
      {
        $group: {
          _id: null,
          totalLockLp: {
            $sum: { $toDouble: "$lp" },
          },
        },
      },
    ]);
    const lockLpId = "Locked LP";
    const totalLockLp = lockLpRet.length > 0 ? lockLpRet[0].totalLockLp : 0;
    tmp.push({
      _id: lockLpId,
      lp: totalLockLp,
    });
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      if (item._id == ZERO_ADDRESS) {
        tmp.push(item);
        break;
      }
    }
    if (tmp.length == 1) {
      tmp.push({
        lp: 0,
        _id: ZERO_ADDRESS,
      });
    }
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      if (item._id == ZERO_ADDRESS) {
        continue;
      }
      tmp.push(item);
    }
    res = tmp;

    const ret: PoolHoldersRes = {
      total: 0,
      list: [],
    };

    const addresses = res
      .filter((item) => item._id != ZERO_ADDRESS && item._id != lockLpId)
      .map((item) => item._id);
    const addressesLockLpRet =
      addresses.length > 0
        ? await lockUserDao.find({
            address: { $in: addresses },
            tick0: sortTick0,
            tick1: sortTick1,
          })
        : [];
    const poolLp = getPoolLp(operator.PendingSpace, pair);
    const poolLpDisplay = parseFloat(bnDecimal(poolLp, LP_DECIMAL));
    for (let i = 0; i < res.length; i++) {
      let lockLp: LockLpItem = undefined;
      const item = res[i];
      if (item._id != lockLpId && item._id != ZERO_ADDRESS) {
        const addressLockLp = addressesLockLpRet.find(
          (addressLockLpRet) => addressLockLpRet.address == item._id
        );
        if (addressLockLp) {
          const { lp } = addressLockLp;
          const data = await getLpInfo({
            tick0,
            tick1,
            lp,
          });
          lockLp = {
            lp,
            amount0: data.amount0,
            amount1: data.amount1,
          };
        } else {
          lockLp = {
            lp: "0",
            amount0: "0",
            amount1: "0",
          };
        }
      }
      const lp = item.lp.toFixed(18);
      const data = await getLpInfo({
        tick0,
        tick1,
        lp,
      });
      if (item._id == lockLpId) {
        lockLp = {
          lp,
          amount0: data.amount0,
          amount1: data.amount1,
        };
      }
      ret.list.push({
        address: item._id,
        lp,
        amount0: data.amount0,
        amount1: data.amount1,
        shareOfPool: parseFloat(lp) / poolLpDisplay,
        lockLp,
      });
    }

    ret.list = ret.list.filter((a) => {
      return (
        (a.address.length > 20 && a.address != env.ModuleInitParams.fee_to) ||
        a.address == lockLpId
      );
    });
    ret.total = ret.list.length;
    ret.list = ret.list.slice(start, start + limit);

    this.cache[key] = {
      data: ret,
      intervalMs: 60_000,
      timestamp: Date.now(),
    };
    return ret;
  }

  async rewardCurve(params: RewardCurveReq): Promise<RewardCurveRes> {
    const { address, tick0, tick1, startTime, endTime } = params;
    const key = `rewardCurve-${tick0}-${tick1}-${address}-${startTime}-${endTime}`;
    if (this.cache[key]) {
      return this.cache[key].data;
    }

    const pair = getPairStrV1(tick0, tick1);
    const list = await rewardCurveDao.find({
      address,
      pair,
      timestamp: { $gte: startTime / 1000, $lte: endTime / 1000 },
    });
    const ret: RewardCurveRes = {
      total: list.length,
      list,
    };

    this.cache[key] = {
      data: ret,
      intervalMs: 60_000,
      timestamp: Date.now(),
    };
    return ret;
  }

  clearCache(keyWord: string) {
    if (!keyWord) {
      return;
    }
    for (let key in this.cache) {
      if (key.includes(keyWord)) {
        delete this.cache[key];
      }
    }
  }

  async taskList(params: TaskListReq): Promise<TaskListRes> {
    global.logger.debug({
      tag: "Query.taskList",
      msg: `Querying task list for address: ${params.address}`,
    });

    const key = `taskList-${JSON.stringify(params)}`;
    if (this.cache[key]) {
      global.logger.debug({
        tag: "Query.taskList",
        msg: "Returning cached result",
      });
      return this.cache[key].data;
    }

    // Get the latest tid from task-meta-dao
    let tid = params.tid;
    if (!tid) {
      const latestTaskMeta = await global.taskMetaDao.findOne(
        {},
        { sort: { startTime: -1 } }
      );
      tid = latestTaskMeta?.tid;
    }

    global.logger.debug({
      tag: "Query.taskList",
      msg: `Latest task meta: ${tid}`,
    });

    if (!tid) {
      // Return empty result if no task meta data
      const ret: TaskListRes = {
        tid: "",
        list: [],
        startTime: 0,
        endTime: 0,
      };

      this.cache[key] = {
        data: ret,
        intervalMs: 60_000, // Cache for 1 minute
        timestamp: Date.now(),
      };

      return ret;
    }

    // Get all task items for the latest tid
    const taskMetaList = await global.taskMetaDao.find({
      tid,
    });

    global.logger.debug({
      tag: "Query.taskList",
      msg: `Found ${taskMetaList.length} task meta items for tid: ${tid}`,
    });

    // Update task completion status for the address
    await global.taskList.updateTaskCompletionStatus(tid, params.address);

    // Get updated completion status for the specified address
    const userTaskList = await global.taskDao.find({
      tid,
      address: params.address,
    });

    global.logger.debug({
      tag: "Query.taskList",
      msg: `Found ${userTaskList.length} user tasks for address: ${params.address}`,
    });

    // Create a map of user completion status
    const userCompletionMap = new Map<string, boolean>();
    for (const userTask of userTaskList) {
      userCompletionMap.set(userTask.itemId, userTask.done || false);
    }

    // Build the result list with completion status
    const list = taskMetaList.map((taskMeta) => ({
      tid: taskMeta.tid,
      itemId: taskMeta.itemId,
      address: params.address,
      done: userCompletionMap.get(taskMeta.itemId) || false,
    }));

    const ret: TaskListRes = {
      tid,
      list,
      startTime: taskMetaList[0].startTime,
      endTime: taskMetaList[taskMetaList.length - 1].endTime,
    };

    this.cache[key] = {
      data: ret,
      intervalMs: 60_000, // Cache for 1 minute
      timestamp: Date.now(),
    };

    global.logger.debug({
      tag: "Query.taskList",
      msg: `Cached result with ${ret.list.length} tasks`,
    });
    return ret;
  }

  async getAddressUSD(param: AssetsUSDReq): Promise<AssetsUSDRes> {
    const { address } = param;
    const allBalanceData = await this.getAllBalance({
      address,
      pubkey: "",
    });
    const assetsUSD = Object.values(allBalanceData).reduce((total, asset) => {
      const swapBalance = asset.balance.swap;
      const price = asset.price;
      const assetValue = decimalCal([swapBalance, "mul", price.toString()]);
      return decimalCal([total, "add", assetValue]);
    }, "0");
    const key = `address-pool-usd-${address}`;
    let lpUSD: string;
    if (this.cache[key]) {
      lpUSD = this.cache[key].data;
    } else {
      const poolData = await this.myPoolList({
        address,
        start: 0,
        limit: 10,
      });
      lpUSD = poolData.totalLpUSD;
      this.cache[key] = {
        data: lpUSD,
        intervalMs: 3_000,
        timestamp: Date.now(),
      };
    }

    return {
      assetsUSD,
      lpUSD,
    };
  }
}
