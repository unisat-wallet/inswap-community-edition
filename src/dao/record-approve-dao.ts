import { UpdateOptions } from "mongodb";
import { Result } from "../types/func";
import { BaseDao } from "./base-dao";

export type RecordApproveData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  tick: string;
  amount: string;
  type: "approve" | "decreaseApprove";
  preResult: Result;
  result: Result;
  ts: number;
  success: boolean;
};

export class RecordApproveDao extends BaseDao<RecordApproveData> {
  upsertData(data: RecordApproveData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
