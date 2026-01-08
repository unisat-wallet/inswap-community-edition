import { StakeHistoryType } from "../types/route";
import { BaseDao } from "./base-dao";
import { StakePoolData } from "./stake-pool-dao";
import { StakeUserData } from "./stake-user-dao";

export type StakeHistoryData = {
  id: string; // function
  pid: string;
  address: string;
  poolTick0: string;
  poolTick1: string;
  type: StakeHistoryType;
  amount: string;
  tick: string;
  ts: number;
  status: "pending" | "success";
  userInfo: Partial<StakeUserData>;
  poolInfo: Partial<StakePoolData>;
  height: number;
  value: number;
  amount0: string;
  amount1: string;
  tick0Price: number;
  tick1Price: number;
};

export class StakeHistoryDao extends BaseDao<StakeHistoryData> {}
