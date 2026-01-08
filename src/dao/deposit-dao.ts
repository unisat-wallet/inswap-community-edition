import { UpdateOptions } from "mongodb";
import { need } from "../domain/utils";
import { DepositType } from "../types/route";
import { BaseDao } from "./base-dao";

export type DepositData = {
  cursor: number;
  address: string;
  inscriptionId: string;
  tick: string;
  amount: string;
  height: number;
  ts: number;
  txid: string;
  type: DepositType;
};

export class DepositDao extends BaseDao<DepositData> {
  upsertDataByInscriptionId(data: DepositData, opts: UpdateOptions = {}) {
    if (!data.ts) {
      delete data.ts;
    }
    need(!!data.inscriptionId);
    return this.upsertOne(
      { inscriptionId: data.inscriptionId },
      { $set: data },
      opts
    );
  }

  upsertDataByTxid(data: DepositData, opts: UpdateOptions = {}) {
    if (!data.ts) {
      delete data.ts;
    }
    need(!!data.txid);
    return this.upsertOne({ txid: data.txid }, { $set: data }, opts);
  }
}
