import { BaseDao } from "./base-dao";

export type StakeUserData = {
  pid: string;
  tick0: string;
  tick1: string;
  address: string;
  amount: string;
  rewardDebt: string;
  rewardUnclaimed: string;
  rewardClaimed: string;
  lastStakeTs: number;
};

export class StakeUserDao extends BaseDao<StakeUserData> {}
