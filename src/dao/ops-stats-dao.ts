import { BaseDao } from "./base-dao";

export type OpsStatsData = {
  pair: string;
  timestamp: number;
  totalVolumeValue: number;
  totalTvlValue: number;
  lpAddressMap: { [lockedLpValue: string]: number };
  totalLockedLpValue: number;
};

export class OpsStatsDao extends BaseDao<OpsStatsData> {}
