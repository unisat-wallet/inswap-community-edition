import { bn, bnDecimal, decimalCal, uintCal } from "../contract/bn";
import { getPairStructV2, need } from "../contract/contract-utils";
import { LpRewardPoolData } from "../dao/lp-reward-pool-dao";
import { LpRewardUserData } from "../dao/lp-reward-user-dao";
import { LP_DECIMAL } from "./constant";
import { pool_not_found } from "./error";
import { Space } from "./space";

export type LpRewardPoolMap = { [pair: string]: LpRewardPoolData };
export type LpRewardUserMap = {
  [pair: string]: { [address: string]: LpRewardUserData };
};

const TAG = "lp-reward";

export class LpReward {
  private poolMap: LpRewardPoolMap = {};
  private userMap: LpRewardUserMap = {};
  private space: Space;

  get PoolMap() {
    return this.poolMap;
  }

  get UserMap() {
    return this.userMap;
  }

  constructor(
    poolMap: LpRewardPoolMap,
    userMap: LpRewardUserMap,
    space: Space
  ) {
    this.poolMap = poolMap;
    this.userMap = userMap;
    this.space = space;
  }

  async tick() {
    for (const pair in this.poolMap) {
      const item = this.poolMap[pair];
      this.updatePool(pair);
      await poolListDao.updateOne(
        { tick0: item.tick0, tick1: item.tick1 },
        {
          $set: {
            reward0: parseFloat(item.reward0),
            reward1: parseFloat(item.reward1),
          },
        }
      );
    }
  }

  updatePool(pair: string, onlyUpdateLiq = false) {
    need(this.space.Assets.isExist(pair), pool_not_found);

    if (!this.poolMap[pair]) {
      const { tick0, tick1 } = getPairStructV2(pair);
      this.poolMap[pair] = {
        tick0,
        tick1,
        pair,
        accRewardPerShare: "0",
        accTotal: "0",
        reward0: "0",
        reward1: "0",
        lastK: "0",
        lastPoolLp: "0",
      };
    }

    const assets = this.space.Contract.assets;
    const { tick0, tick1 } = getPairStructV2(pair);
    const k = uintCal([
      assets.get(tick0).balanceOf(pair),
      "mul",
      assets.get(tick1).balanceOf(pair),
    ]);
    const poolLp = decimalCal([
      assets.getSwapSupply(pair),
      "sub",
      assets.get(pair).balanceOf(this.space.Contract.config.feeTo),
    ]);

    const pool = this.poolMap[pair];
    if (pool.lastK == k && pool.lastPoolLp == poolLp) {
      // already updated
      return;
    }

    if (onlyUpdateLiq) {
      pool.lastK = k;
      pool.lastPoolLp = poolLp;
    } else {
      const w2 = decimalCal([k, "sqrt"]);
      const w1 = decimalCal([pool.lastK, "sqrt"]);

      if (bn(w2).gt(w1)) {
        // x = (w2-w1)/poolLp*5/6
        /**
         * Why multiply by 5/6? Because the LP rewards issued by the system not only account for a portion of the transaction fees (A), but also a small part of the users' original liquidity (B). If you use the incremental total wealth / total LP to calculate the rewards, the calculation will be inaccurate because it does not deduct the B part. Therefore, using the user's incremental wealth / user's total LP to calculate the rewards per LP is accurate
         */
        const x = decimalCal([
          w2,
          "sub",
          w1,
          "div",
          poolLp,
          "div",
          6,
          "mul",
          5,
        ]);
        pool.accRewardPerShare = decimalCal([pool.accRewardPerShare, "add", x]);
        pool.accTotal = decimalCal([pool.accTotal, "add", w2, "sub", w1]);
      }
      pool.lastK = k;
      pool.lastPoolLp = poolLp;
    }

    const res = this.getPoolReward(pair);
    pool.reward0 = res.reward0;
    pool.reward1 = res.reward1;
  }

  // need update first
  settlement(pair: string, address: string) {
    if (!this.userMap[pair]) {
      this.userMap[pair] = {};
    }
    if (!this.userMap[pair][address]) {
      const { tick0, tick1 } = getPairStructV2(pair);
      this.userMap[pair][address] = {
        pair,
        tick0,
        tick1,
        address,
        rewardDebt: "0",
        rewardUnclaimed: "0",
        rewardClaimed: "0",
        lastLp: "0",

        claimedReward0: "0",
        claimedReward1: "0",
        unclaimedReward0: "0",
        unclaimedReward1: "0",
      };
    }

    if (!this.poolMap[pair]) {
      const { tick0, tick1 } = getPairStructV2(pair);
      this.poolMap[pair] = {
        tick0,
        tick1,
        pair,
        accRewardPerShare: "0",
        accTotal: "0",
        reward0: "0",
        reward1: "0",
        lastK: "0",
        lastPoolLp: "0",
      };
    }
    this.updatePool(pair);

    const lp = this.space.Assets.getAggregateBalance(address, pair, [
      "swap",
      "lock",
    ]);
    const pool = this.poolMap[pair];
    const user = this.userMap[pair][address];
    const lastLp = user.lastLp;
    const acc = decimalCal([pool.accRewardPerShare, "mul", lastLp /** note */]);

    if (bn(acc).gt(user.rewardDebt)) {
      const diff = decimalCal([acc, "sub", user.rewardDebt]);
      user.rewardUnclaimed = decimalCal([user.rewardUnclaimed, "add", diff]);
    }
    user.rewardDebt = decimalCal([
      pool.accRewardPerShare,
      "mul",
      lp /** note */,
    ]);

    user.lastLp = lp;
    const res = this.getUserUnclaimedReward(pair, address);
    user.unclaimedReward0 = res.unclaimedReward0;
    user.unclaimedReward1 = res.unclaimedReward1;

    return lp;
  }

  claim(pair: string, address: string, removedLp: string, lastLp: string) {
    if (removedLp == "0") {
      return { reward0: "0", reward1: "0" };
    }
    this.settlement(pair, address);

    const user = this.userMap[pair][address];
    const claim = decimalCal([
      removedLp,
      "div",
      lastLp,
      "mul",
      user.rewardUnclaimed,
    ]);
    user.rewardUnclaimed = decimalCal([user.rewardUnclaimed, "sub", claim]);
    user.rewardClaimed = decimalCal([user.rewardClaimed, "add", claim]);

    const reward = this.getReward(pair, claim);
    user.claimedReward0 = decimalCal([
      user.claimedReward0,
      "add",
      reward.reward0,
    ]);
    user.claimedReward1 = decimalCal([
      user.claimedReward1,
      "add",
      reward.reward1,
    ]);

    const res = this.getUserUnclaimedReward(pair, address);
    user.unclaimedReward0 = res.unclaimedReward0;
    user.unclaimedReward1 = res.unclaimedReward1;

    return this.getReward(pair, claim);
  }

  sendLp(pair: string, address: string, removedLp: string, lastLp: string) {
    if (removedLp == "0") {
      return { reward0: "0", reward1: "0" };
    }
    this.settlement(pair, address);

    const user = this.userMap[pair][address];
    const claim = decimalCal([
      removedLp,
      "div",
      lastLp,
      "mul",
      user.rewardUnclaimed,
    ]);
    user.rewardUnclaimed = decimalCal([user.rewardUnclaimed, "sub", claim]);
    user.rewardClaimed = decimalCal([user.rewardClaimed, "add", claim]);

    const reward = this.getReward(pair, claim);
    user.claimedReward0 = decimalCal([
      user.claimedReward0,
      "add",
      reward.reward0,
    ]);
    user.claimedReward1 = decimalCal([
      user.claimedReward1,
      "add",
      reward.reward1,
    ]);

    const res = this.getUserUnclaimedReward(pair, address);
    user.unclaimedReward0 = res.unclaimedReward0;
    user.unclaimedReward1 = res.unclaimedReward1;

    return this.getReward(pair, claim);
  }

  getRewardTotal(pair: string) {
    this.updatePool(pair);
    const pool = this.poolMap[pair];
    if (pool) {
      return pool.accTotal;
    } else {
      return "0";
    }
  }

  // getClaimed(pair: string, address: string) {
  //   this.settlement(pair, address);
  //   const user = this.userMap[pair]?.[address];
  //   if (user) {
  //     return user.rewardClaimed;
  //   } else {
  //     return "0";
  //   }
  // }

  // getUnclaimed(pair: string, address: string) {
  //   this.settlement(pair, address);
  //   const user = this.userMap[pair]?.[address];
  //   if (user) {
  //     return user.rewardUnclaimed;
  //   } else {
  //     return "0";
  //   }
  // }

  private getPoolReward(pair: string): { reward0: string; reward1: string } {
    const pool = this.poolMap[pair];
    if (pool) {
      return this.getReward(pair, pool.accTotal);
    } else {
      return {
        reward0: "0",
        reward1: "0",
      };
    }
  }

  private getUserUnclaimedReward(
    pair: string,
    address: string
  ): {
    unclaimedReward0: string;
    unclaimedReward1: string;
  } {
    const user = this.userMap[pair]?.[address];
    if (user) {
      const unclaimed = this.getReward(pair, user.rewardUnclaimed); // changing
      return {
        unclaimedReward0: unclaimed.reward0,
        unclaimedReward1: unclaimed.reward1,
      };
    } else {
      return {
        unclaimedReward0: "0",
        unclaimedReward1: "0",
      };
    }
  }

  getUserReward(
    pair: string,
    address: string,
    lp: string
  ): { reward0: string; reward1: string } {
    const user = this.userMap[pair]?.[address];
    logger.debug({ tag: TAG, msg: "getUserReward", user, pair, address, lp });
    if (user) {
      const totalLp = bnDecimal(
        this.space.Assets.getAggregateBalance(address, pair, ["swap", "lock"]),
        LP_DECIMAL
      );
      this.settlement(pair, address);
      const w = decimalCal([lp, "div", totalLp, "mul", user.rewardUnclaimed]);
      logger.debug({
        tag: TAG,
        msg: "getUserReward",
        w,
        totalLp,
        user,
        reward: this.getReward(pair, w),
      });
      return this.getReward(pair, w);
    } else {
      return { reward0: "0", reward1: "0" };
    }
  }

  getReward(pair: string, w: string): { reward0: string; reward1: string } {
    if (w == "0") {
      return { reward0: "0", reward1: "0" };
    }
    const { tick0, tick1 } = getPairStructV2(pair);
    const reserve0 = this.space.Contract.assets.getBalance(pair, tick0);
    const reserve1 = this.space.Contract.assets.getBalance(pair, tick1);
    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);
    const totalW = decimalCal([reserve0, "mul", reserve1, "sqrt"]);
    if (totalW == "0") {
      return { reward0: "0", reward1: "0" };
    } else {
      return {
        reward0: bnDecimal(
          decimalCal([w, "div", totalW, "mul", reserve0]),
          decimal0
        ),
        reward1: bnDecimal(
          decimalCal([w, "div", totalW, "mul", reserve1]),
          decimal1
        ),
      };
    }
  }
}
