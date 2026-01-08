import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type LpRewardPoolData = {
  pair: string;
  tick0: string;
  tick1: string;
  accRewardPerShare: string;
  accTotal: string;

  //
  lastPoolLp: string;
  lastK: string;
  reward0: string;
  reward1: string;
};

export class LpRewardPoolDao extends BaseDao<LpRewardPoolData> {
  async upsertData(data: LpRewardPoolData, opts: UpdateOptions = {}) {
    await this.upsertOne({ pair: data.pair }, { $set: data }, opts);
  }
}
