import { BaseDao } from "./base-dao";

export type StakeEpochData = {
  eid: string;
  startBlock: number;
  endBlock: number;
  pids: string[];
  event?: boolean;
};

export class StakeEpochDao extends BaseDao<StakeEpochData> {}
