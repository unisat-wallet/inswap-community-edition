import { BaseDao } from "./base-dao";
import { UpdateOptions } from "mongodb";

export type RecordUnlockLpData = {
  id: string;
  address: string;
  tick0: string;
  tick1: string;
  lp: string;
  amount0: string;
  amount1: string;
  amount0USD: string;
  amount1USD: string;
  ts: number;
};

export class RecordUnlockLpDao extends BaseDao<RecordUnlockLpData> {
  upsertData(data: RecordUnlockLpData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
