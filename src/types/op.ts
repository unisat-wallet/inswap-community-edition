import { ApiEvent, EventType } from "./api";
import { InscriptionFunc } from "./func";

export enum OpType {
  deploy = "deploy",
  transfer = "transfer",
  commit = "commit",
  approve = "approve",
  conditionalApprove = "conditional-approve",
  withdraw = "withdraw",
}

export type Op =
  | ModuleOp
  | CommitOp
  | TransferOp
  | ApproveOp
  | ConditionalApproveOp
  | WithdrawOp;

export type OpEvent = {
  cursor: number;
  valid: boolean;
  event: EventType;
  op: Op;
  height: number;
  from: string;
  to: string;
  inscriptionId: string;
  inscriptionNumber: number;
  blocktime: number;
  txid: string;
  data: ApiEvent["data"];
};

export type ModuleOp = {
  p: "brc20-module";
  op: OpType.deploy;
  name: string; // "xxxx",
  source: string; // "xxxxxxxi0"
  init: {
    swap_fee_rate?: string; // "0.01"
    gas_tick: string;
    gas_to: string;
    fee_to: string;
    sequencer: string;
  };
};

export type ApproveOp = {
  p: "brc20-swap";
  op: OpType.approve;
  tick: string; // "ordi"
  amt: string; // "10"
  module: string; // "idxxxxi0"
};

export type ConditionalApproveOp = {
  p: "brc20-swap";
  op: OpType.conditionalApprove;
  tick: string; // "ordi"
  amt: string; // "10"
  module: string; // "idxxxxi0"
};

export type CommitOp = {
  p: "brc20-swap";
  op: OpType.commit;
  module: string; // "idxxxxi0"
  parent: string; // "xxxxi0"
  gas_price: string; // "100"
  data: InscriptionFunc[];
  swap_fee_rate?: string;
};

export type TransferOp = {
  p: "brc20";
  op: OpType.transfer;
  tick: string; //"ordi"
  amt: string; //"100"
};

export type DeployOp = {
  p: "brc20-swap";
  op: OpType.deploy;
};

export type WithdrawOp = {
  p: "brc20-module";
  op: OpType.withdraw;
  tick: string; // "ordi"
  amt: string; // "10"
  module: string; // "idxxxxi0"
};
