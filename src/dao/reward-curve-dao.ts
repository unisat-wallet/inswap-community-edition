import { BaseDao } from "./base-dao";

export type RewardCurveData = {
  pair: string;
  address: string;
  shareOfPool: number;
  accReward0: string;
  accReward1: string;
  price0: string;
  price1: string;
  timestamp: number;
};

export class RewardCurveDao extends BaseDao<RewardCurveData> {}
