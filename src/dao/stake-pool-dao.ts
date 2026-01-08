import { BaseDao } from "./base-dao";

export type StakePoolData = {
  pid: string;
  tick0: string;
  tick1: string;
  rewardTick: string;
  lastRewardBlock: number;
  fbPerBlock: string;
  accFbPerShare: string;
  lpSupply: string;
  stageNeedLp: string[];
  stageAddedRewards: string[];
  stageAddedRewardsHeight: number[];
  stageAddedRewardsFbPerBlock: string[];
  stakingLimit: string;
  apy: number;

  // wallet
  walletAddress: string;
  walletWif: string;
  walletWifWithKey: string;
};

export class StakePoolDao extends BaseDao<StakePoolData> {}
