import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type LpRewardUserData = {
  pair: string;
  tick0: string;
  tick1: string;
  address: string;
  rewardDebt: string;
  rewardUnclaimed: string;
  rewardClaimed: string;
  lastLp: string;

  //
  claimedReward0: string;
  claimedReward1: string;
  unclaimedReward0: string;
  unclaimedReward1: string;
};

export class LpRewardUserDao extends BaseDao<LpRewardUserData> {
  async upsertData(data: LpRewardUserData, opts: UpdateOptions = {}) {
    await this.upsertOne(
      { pair: data.pair, address: data.address },
      { $set: data },
      opts
    );
  }
}
