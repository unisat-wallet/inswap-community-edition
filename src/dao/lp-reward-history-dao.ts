import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type LpRewardHistoryData = {
  id: string;
  type: "lp-reward";
  address: string;
  tick0: string;
  tick1: string;
  reward0: string;
  reward1: string;
  ts: number;
};

export class LpRewardHistoryDao extends BaseDao<LpRewardHistoryData> {
  upsertData(data: LpRewardHistoryData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
