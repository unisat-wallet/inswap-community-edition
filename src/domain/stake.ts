import { Mutex } from "async-mutex";
import hash from "object-hash";
import { bn, bnDecimal } from "../contract/bn";
import { getPairStrV2 } from "../contract/contract-utils";
import { FuncType } from "../types/func";
import { queue } from "../utils/utils";
import {
  ClaimReq,
  ClaimRes,
  Epoch,
  FuncReq,
  PayType,
  StakeHistoryReq,
  StakeHistoryRes,
  StakeListReq,
  StakeListRes,
  StakePoolSummaryInfo,
  StakePoolUserInfo,
  StakeReq,
  StakeRes,
  StakeUserInfoReq,
  StakeUserInfoRes,
  UnstakeReq,
  UnstakeRes,
} from "./../types/route";
import {
  expired_data,
  params_error,
  staking_pool_balance_not_enough,
} from "./error";
import { need } from "./utils";

const TAG = "stake";

export class Stake {
  private mutex = new Mutex();

  async stake(req: StakeReq): Promise<StakeRes> {
    return await queue(this.mutex, async () => {
      const stakePool = stakePoolMgr.getStakePool(req.pid);

      const { address, amount } = req;
      const pair = getPairStrV2(stakePool.tick0, stakePool.tick1);
      await stakePoolMgr.checkLockAmount(address, pair);

      const params: FuncReq = {
        func: FuncType.lock,
        req: {
          tick0: stakePool.tick0,
          tick1: stakePool.tick1,
          ...req,
        },
      };

      // test
      const res = await operator.aggregate(params, true);
      await stakePool.deposit(null, address, amount, true);

      try {
        // do action
        const id = (res as any).optFunc.id;

        await mongoUtils.startTransaction(async (session) => {
          const clone = stakePool.clone();
          await clone.deposit(id, address, amount);

          const poolInfo = await clone.updatePoolDao(session);
          const userInfo = await clone.updateUserDao(address, session);
          await clone.updateRecordDao(
            {
              id,
              type: "stake",
              tick: "LP",
              amount,
              address,
              userInfo,
              poolInfo,
            },
            session
          );

          await operator.aggregate(params);
          await stakePool.deposit(id, address, amount);
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "stake error",
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }

      return {};
    });
  }

  async unstake(req: UnstakeReq): Promise<UnstakeRes> {
    return await queue(this.mutex, async () => {
      const stakePool = stakePoolMgr.getStakePool(req.pid);
      const { address, amount } = req;
      const pair = getPairStrV2(stakePool.tick0, stakePool.tick1);
      await stakePoolMgr.checkLockAmount(address, pair);

      const params: FuncReq = {
        func: FuncType.unlock,
        req: {
          tick0: stakePool.tick0,
          tick1: stakePool.tick1,
          ...req,
        },
      };

      // test
      const res = await operator.aggregate(params, true);
      await stakePool.withdraw(null, address, amount, true);

      try {
        // do action
        const id = (res as any).optFunc.id;
        need(!!id);

        await mongoUtils.startTransaction(async (session) => {
          const clone = stakePool.clone();
          await clone.withdraw(id, address, amount);

          const poolInfo = await clone.updatePoolDao(session);
          const userInfo = await clone.updateUserDao(address, session);
          await clone.updateRecordDao(
            {
              id,
              type: "unstake",
              tick: "LP",
              amount,
              address,
              userInfo,
              poolInfo,
            },
            session
          );

          await operator.aggregate(params);
          await stakePool.withdraw(id, address, amount);
        });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "unstake error",
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }

      return {};
    });
  }

  async claim(params: ClaimReq): Promise<ClaimRes> {
    return await queue(this.mutex, async () => {
      const stakePool = stakePoolMgr.getStakePool(params.pid);
      const userReq: FuncReq = {
        func: FuncType.claim,
        req: params,
      };
      const { address } = params;
      const pair = getPairStrV2(stakePool.tick0, stakePool.tick1);
      await stakePoolMgr.checkLockAmount(address, pair);

      let isUserFeeFree = false;
      if (params.sigs.length == 0) {
        const id = hash({
          pid: userReq.req.pid,
          address: userReq.req.address,
          feeTick: userReq.req.feeTick,
          ts: userReq.req.ts,
        });
        const item = operator.preResMap[id];
        need(!!item, expired_data);
        need(params.sigs.length == item.res.signMsgs.length, params_error);
        if (parseFloat(item.res.usageFreeQuota) > 0) {
          isUserFeeFree = true;
        }
      }

      const reward = stakePool.getUnclaimed(address);
      const sysReq: FuncReq = {
        func: FuncType.send,
        req: {
          address: stakePool.wallet.address,
          tick: stakePool.rewardTick,
          amount: reward,
          feeTick: config.feeTicks[0],
          to: address,
          ts: Math.floor(Date.now() / 1000),
          payType: PayType.tick, // note
        },
      };

      const sysBalance = bnDecimal(
        operator.PendingSpace.Assets.getBalance(
          stakePool.wallet.address,
          stakePool.rewardTick
        ),
        decimal.get(stakePool.rewardTick)
      );
      if (bn(sysBalance).lt(reward)) {
        throw new Error(staking_pool_balance_not_enough);
      }

      const preRes = await operator.genPreRes(sysReq);
      need(preRes.signMsgs.length == 1);
      const sig = await stakePool.wallet.signMessage(
        preRes.signMsgs[0],
        "bip322-simple"
      );
      sysReq.req.feeTickPrice = preRes.feeTickPrice;
      sysReq.req.feeAmount = preRes.feeAmount;
      sysReq.req.sigs = [sig];

      const reqs: FuncReq[] = [sysReq];
      if (!isUserFeeFree) {
        reqs.push(userReq);
      }

      // test
      const res = await operator.batchAggregate(reqs, true);
      await stakePool.claim(null, address, reward, true);

      try {
        // do action
        const id = res[0].optFunc.id;
        need(!!id);

        stakePool.checkPoolBalance();
        await mongoUtils.startTransaction(async (session) => {
          const clone = stakePool.clone();
          await clone.claim(id, address, reward);

          const poolInfo = await clone.updatePoolDao(session);
          const userInfo = await clone.updateUserDao(address, session);
          await clone.updateRecordDao(
            {
              id,
              type: "claim",
              tick: clone.rewardTick,
              amount: reward,
              address,
              userInfo,
              poolInfo,
            },
            session
          );
          await stakePool.claim(id, address, reward);
          await operator.batchAggregate(reqs);
        });

        return { amount: reward };
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "claim error",
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }
    });
  }

  async getHistory(req: StakeHistoryReq): Promise<StakeHistoryRes> {
    const query = {
      address: req.address,
    };
    if (req.pid) {
      query[req.pid] = req.pid;
    }
    if (req.type) {
      if (req.type == "all") {
        //
      } else {
        query["type"] = req.type;
      }
    }
    if (req.search) {
      query["$or"] = [
        { poolTick0: { $regex: req.search, $options: "i" } },
        { poolTick0: { $regex: req.search, $options: "i" } },
      ];
      try {
        const [poolTick0, poolTick1] = req.search.split("/");
        need(!!poolTick0);
        need(!!poolTick1);
        query["$or"].push({
          poolTick0: { $regex: poolTick0, $options: "i" },
          poolTick1: { $regex: poolTick1, $options: "i" },
        });
      } catch (err) {
        //
      }
    }
    const total = await stakeHistoryDao.count(query);
    const list = await stakeHistoryDao.find(query, {
      sort: { _id: -1 },
      projection: { _id: 0, userInfo: 0, poolInfo: 0 },
    });
    return { total, list };
  }

  getSummary(pid: string) {
    const stakePool = stakePoolMgr.poolMap[pid];

    const summary: StakePoolSummaryInfo = {
      pid: stakePool.pid,
      poolTick0: stakePool.tick0,
      poolTick1: stakePool.tick1,
      rewardTick: stakePool.rewardTick,
      curTotalLp: stakePool.LpSupply,
      baseReward: stakePool.BaseReward,
      stageNeedLp: stakePool.StageNeedLp,
      stageAddedRewards: stakePool.StageAddedRewards,
      stakingLimit: stakePool.StakingLimit,
      distributedReward: stakePool.getDistributedReward(),
      extractReward: stakePool.getExtractReward(),
      extractDistributedReward: stakePool.getExtractDistributedReward(),
      apy: stakePool.Apy,
    };
    return summary;
  }

  getUserInfo(pid: string, address: string) {
    if (!address) {
      return null;
    }
    const stakePool = stakePoolMgr.poolMap[pid];
    const pair = getPairStrV2(stakePool.tick0, stakePool.tick1);

    const userInfo: StakePoolUserInfo = {
      pid: stakePool.pid,
      address,
      availableLp: operator.PendingSpace.getLpBalance(address, pair).swap,
      stakedLp: stakePool.UserInfo[address]?.amount || "0",
      claimed: stakePool.UserInfo[address]?.rewardClaimed || "0",
      unclaimed: stakePool.getUnclaimed(address),
      lastStakeTs: stakePool.UserInfo[address]?.lastStakeTs || 0,
    };
    return userInfo;
  }

  async getUserInfoMap(req: StakeUserInfoReq): Promise<StakeUserInfoRes> {
    let ret: StakeUserInfoRes = {};
    for (const pid in stakePoolMgr.poolMap) {
      const userInfo = this.getUserInfo(pid, req.address);
      ret[pid] = userInfo;
    }
    return ret;
  }

  async getList(req: StakeListReq): Promise<StakeListRes> {
    const list: Epoch[] = [];
    const res = await stakeEpochDao.find(
      {},
      { sort: { _id: -1 }, projection: { _id: 0 } }
    );
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      // Skip epochs with event: true for stake_list
      if (item.event === true) {
        continue;
      }
      const epoch: Epoch = {
        eid: item.eid,
        startBlock: item.startBlock,
        endBlock: item.endBlock,
        stakePools: [],
      };
      item.pids.forEach((pid) => {
        const stakePool = stakePoolMgr.getStakePool(pid);
        epoch.startBlock = stakePool.StartBlock;
        epoch.endBlock = stakePool.EndBlock;
        const summary = this.getSummary(pid);
        epoch.stakePools.push({ summary });
      });
      list.push(epoch);
    }

    return { list, newestHeight: env.NewestHeight };
  }

  /**
   * Get single epoch by eid (including event epochs)
   */
  async getEpochByEid(eid: string): Promise<Epoch | null> {
    const item = await stakeEpochDao.findOne({ eid });
    if (!item) {
      return null;
    }

    const epoch: Epoch = {
      eid: item.eid,
      startBlock: item.startBlock,
      endBlock: item.endBlock,
      stakePools: [],
    };

    item.pids.forEach((pid) => {
      const stakePool = stakePoolMgr.getStakePool(pid);
      epoch.startBlock = stakePool.StartBlock;
      epoch.endBlock = stakePool.EndBlock;
      const summary = this.getSummary(pid);
      epoch.stakePools.push({ summary });
    });

    return epoch;
  }
}
