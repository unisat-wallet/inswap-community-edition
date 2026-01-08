import { BaseDao } from "./base-dao";
import { UpdateOptions } from "mongodb";

export type RecordLockLpData = {
  id: string;
  address: string;
  tick0: string;
  tick1: string;
  lp: string;
  amount0: string;
  amount1: string;
  amount0USD: string;
  amount1USD: string;
  lockDay: number;
  unlockTime: number;
  ts: number;
};

export class RecordLockLpDao extends BaseDao<RecordLockLpData> {
  upsertData(data: RecordLockLpData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
