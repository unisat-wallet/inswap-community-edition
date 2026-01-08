import { UpdateOptions } from "mongodb";
import { Result, SendLpResult } from "../types/func";
import { BaseDao } from "./base-dao";

export type RecordSendData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  tick: string;
  amount: string;
  to: string;
  preResult: Result;
  result: Result;
  ts: number;
  success: boolean;
  isLp?: boolean;
  sendLpResult?: SendLpResult;
};

export class RecordSendDao extends BaseDao<RecordSendData> {
  upsertData(data: RecordSendData, opts: UpdateOptions = {}) {
    return this.upsertOne({ id: data.id }, { $set: data }, opts);
  }
}
