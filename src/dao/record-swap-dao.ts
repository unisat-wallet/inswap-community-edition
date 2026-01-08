import { UpdateOptions } from "mongodb";
import { Result } from "../types/func";
import { SwapHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordSwapData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  preResult: Result;
  result: Result;
  success: boolean;
  value: number;
} & SwapHistoryItem;

export class RecordSwapDao extends BaseDao<RecordSwapData> {
  upsertData(data: RecordSwapData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
