import { PreRes } from "../types/route";
import { BaseDao } from "./base-dao";

export type WithdrawStatus =
  | "pendingOrder"
  | "pendingCancel"
  | "order"
  | "error"
  | "completed"
  | "cancel";

export type WithdrawType = "conditional" | "direct" | "bridge";

export type WithdrawData = {
  id: string;
  rollUpHeight: number;
  approveHeight: number;
  cancelHeight: number;
  status: WithdrawStatus;
  type: WithdrawType;

  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  ts: number;

  commitParent: string;
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
  inscriptionId: string;
  op: string;

  signedPaymentPsbt?: string;
  signedInscribePsbt: string;
  signedApprovePsbt?: string;
  rollUpTxid?: string;
  paymentTxid?: string;
  inscribeTxid?: string;
  approveTxid?: string;
  errMsg?: string;
  failCount?: number;
  testFail?: boolean;
} & PreRes;

export class WithdrawDao extends BaseDao<WithdrawData> {
  upsertData(data: WithdrawData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
