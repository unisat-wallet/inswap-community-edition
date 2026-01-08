import { bnDecimal, decimalCal } from "../contract/bn";
import { getPairStructV2, getPairStrV1 } from "../contract/contract-utils";
import { RewardCurveData } from "../dao/reward-curve-dao";
import { LP_DECIMAL } from "./constant";

const TAG = "RewardCurve";

export class RewardCurve {
  async init() {
    if (config.initiateRewardCurveUpdate) {
      await this.tick();
    }

    const schedule = require("node-schedule");
    const rule = new schedule.RecurrenceRule();
    rule.hour = 16; // 16:00 UTC
    rule.minute = 0;
    rule.second = 0;
    rule.tz = "Etc/UTC";
    schedule.scheduleJob(rule, async () => {
      try {
        logger.info({ tag: TAG, msg: "Scheduled tick started" });
        await this.tick();
        logger.info({ tag: TAG, msg: "Scheduled tick completed" });
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "Scheduled tick failed",
          error: err.message,
          stack: err.stack,
        });
      }
    });
  }

  async tick() {
    for (const pair in operator.PendingSpace.LpReward.UserMap) {
      const { tick0, tick1 } = getPairStructV2(pair);
      const pairV1 = getPairStrV1(tick0, tick1);
      const pool = await query.poolInfo({ tick0, tick1 });
      const poolLp = pool.lp;
      if (!pool) {
        logger.info({ tag: TAG, msg: "Pool not found", pair });
        continue;
      }
      logger.info({ tag: TAG, msg: "Update reward curve", pair });
      const price0 = await query.getTickPrice(tick0);
      const price1 = await query.getTickPrice(tick1);
      const userMap = operator.PendingSpace.LpReward.UserMap[pair];
      const swapAssets = operator.PendingSpace.Assets.dataRefer()["swap"];
      const lockAssets = operator.PendingSpace.Assets.dataRefer()["lock"];
      for (const address in userMap) {
        operator.PendingSpace.LpReward.settlement(pair, address);
        const user = operator.PendingSpace.LpReward.UserMap[pair][address];
        const accReward0 = decimalCal([
          user.unclaimedReward0,
          "add",
          user.claimedReward0,
        ]);
        const accReward1 = decimalCal([
          user.unclaimedReward1,
          "add",
          user.claimedReward1,
        ]);
        const myLp = bnDecimal(
          decimalCal([
            swapAssets[pair].balanceOf(address),
            "add",
            lockAssets[pair]?.balanceOf(address) || "0",
          ]),
          LP_DECIMAL
        );
        const shareOfPool =
          poolLp == "0"
            ? 0
            : parseFloat((parseFloat(myLp) / parseFloat(poolLp)).toFixed(8));
        const item: RewardCurveData = {
          pair: pairV1,
          address,
          shareOfPool,
          accReward0,
          accReward1,
          price0: price0.toString(),
          price1: price1.toString(),
          timestamp: Math.floor(Date.now() / 1000),
        };

        await rewardCurveDao.insert(item);
      }
    }
  }
}
