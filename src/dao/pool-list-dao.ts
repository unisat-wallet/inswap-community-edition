import { BaseDao } from "./base-dao";

export type PoolListData = {
  tick0: string;
  tick1: string;
  amount0: number;
  amount1: number;
  lp: number;
  tvl: number;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  reward0: number;
  reward1: number;
  updateTime?: number;
};

export class PoolListDao extends BaseDao<PoolListData> {}
