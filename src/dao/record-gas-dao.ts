import { UpdateOptions } from "mongodb";
import { GasHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordGasData = {
  id: string;
  address: string;
  success: boolean;
} & GasHistoryItem;

export class RecordGasDao extends BaseDao<RecordGasData> {
  upsertData(data: RecordGasData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
