import { UpdateOptions } from "mongodb";
import { Result } from "../types/func";
import { LiqHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordLiqData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  preResult: Result;
  result: Result;
  success: boolean;
  value: number;
  lpMatchSkip?: boolean;
} & LiqHistoryItem;

export class RecordLiqDao extends BaseDao<RecordLiqData> {
  upsertData(data: RecordLiqData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
