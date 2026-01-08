import { MultiSwapHistoryItem } from "../types/route";
import { ExactType } from "../types/func";
import { BaseDao } from "./base-dao";
import { UpdateOptions } from "mongodb";

export type RecordMultiSwapData = {
  id: string;
  address: string;
  tickIn: string;
  tickOut: string;
  amountIn: string;
  amountOut: string;
  exactType: ExactType;
  ts: number;
  value: number;
  route0: MultiSwapHistoryItem;
  route1: MultiSwapHistoryItem;
};

export class RecordMultiSwapDao extends BaseDao<RecordMultiSwapData> {
  upsertData(data: RecordMultiSwapData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
