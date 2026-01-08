import { AddressType } from "./domain";
import { OpEvent } from "./op";

export type FeeEstimate = {
  BlocksAvgFeeRate: { feerate: number; height: number; ts: number }[];
  BlocksFeeRateEstimate: { blocks: number; feerate: number }[];
  BTCPrice: number;
};

export type FeeEstimateMempool = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
};

export type PriceInfo = {
  price: number;
  updateTime: number;
};

export type BlockInfo = {
  chain: string;
  blocks: number;
  headers: number;
  bestBlockHash: string;
  prevBlockHash: string;
  medianTime: number;
  chainwork: string;
};

export type OrderReq = {
  files: { dataURL: string; filename: string }[];
  feeRate: number;
  receiveAddress: string;
  balance: number;
  brand: string;
  referrer?: string;
  id: string;
  disableRBF?: boolean;
};

export type OrderRes = {
  orderId: string;
  payAddress: string;
  amount: number;
  feeRate: number;
  minerFee: number;
  serviceFee: number;
  count: number;
};

export type OrderData = {
  orderId: string;
  status: string;
  payAddress: string;
  receiveAddress: string;
  amount: number;
  balance: number;
  createts: number;
  isPaidOffchain: boolean;
  feeRate: number;
  minerFee: number;
  serviceFee: number;
  files: {
    filename: string;
    size: number;
    inscriptionId: string;
  }[];
  count: number;
  minted: number;
};

export type OpEventsRes = {
  total: number;
  list: OpEvent[];
};

export type UtxoData = {
  // cursor: number;
  total: number;
  // totalConfirmed: number;
  // totalUnconfirmed: number;
  // totalUnconfirmedSpend: number;
  utxo: UTXO[];
};

export type UTXO = {
  txid: string;
  vout: number;
  satoshi: number;
  scriptPk?: string;
  height?: number;
  codeType: AddressType;
};

export type ToSignInput = {
  index: number;
  address: string;
};

export type CommitUTXO = UTXO & {
  used?: "locked" | "used" | "unused";
  status?: "unconfirmed" | "confirmed";
  purpose: "inscribe" | "activate" | "sequence";
};

export type NFT = {
  address: string;
  inscriptionId: string;
  inscriptionNumber: number;
  offset: number;
  brc20: {
    amt: string;
    decimal: string;
    lim: string;
    op: string;
    tick: string;
  };
  utxo: UTXO;
};

export type Brc20Info = {
  decimal: number;
  // height: number;
  limit: number;
  max: string;
  ticker: string;
  deployHeight: number;
};

export type FreeQuotaSummaryData = {
  address: string;
  tick: string;
  totalQuota: string;
  usedQuota: string;
};
export type FreeQuotaSummaryRes = FreeQuotaSummaryData & {
  btcFbRate: number;
  hasVoucher: boolean;
};

export type UseFreeQuotaReq = {
  address: string;
  tick: string;
  amount: string;
  type: "swap";
  timestamp: number;
};

export type UseFreeQuotaRes = {};

export type Brc20Summary = {
  total: number;
  detail: {
    ticker: string;
    overallBalance: string;
    transferableBalance: string;
    availableBalance: string;
  }[];
};

export type RunesSummary = {
  start: number;
  total: number;
  detail: {
    amount: string;
    runeid: string;
    rune: string;
    spacedRune: string;
    symbol: string;
    divisibility: number;
  }[];
};

export type AlkanesSummary = {
  start: number;
  total: number;
  detail: {
    amount: string;
    alkaneid: string; //"2584327:44",
    // alkane: string; // "AAAAAAAAAAAAAB",
    symbol: string; //"G",
    divisibility: number; //0
  }[];
};

export type AlkanesInfo = {
  alkaneid: string; // "2583283:1333";
  name: string; //"UNCOMMONGOODS";
  height: number; //2583283;
  divisibility: number; //2;
  symbol: string; //"G";
  holders: number; //1000;
};

export type BalanceRes = {
  address: string;
  satoshi: number;
  pendingSatoshi: number;
  utxoCount: number;
  btcSatoshi: number;
  btcPendingSatoshi: number;
  btcUtxoCount: number;
  inscriptionSatoshi: number;
  inscriptionPendingSatoshi: number;
  inscriptionUtxoCount: number;
};

export type AvailableBalanceRes = {
  totalBalance: number;
  availableBalance: number;
  unavailableBalance: number;
  totalUtxoCount: number;
  availableUtxoCount: number;
  unavailableUtxoCount: number;
};

export enum EventType {
  inscribeModule = "inscribe-module",
  transfer = "transfer",
  inscribeApprove = "inscribe-approve",
  inscribeConditionalApprove = "inscribe-conditional-approve",
  approve = "approve",
  conditionalApprove = "conditional-approve",
  commit = "commit",
  inscribeWithdraw = "inscribe-withdraw",
  withdraw = "withdraw",
}

export type ModuleInscriptionInfo = {
  utxo: UTXO;
  //...
  inscriptionId: string;
  data?: {
    amt: string;
    balance: string;
    module: string;
    op: string;
    tick: string;
  };
};

export type ApiEvent = {
  valid: boolean;
  type: EventType;
  txid: string;
  inscriptionId: string;
  inscriptionNumber: number;
  from: string;
  to: string;
  contentBody: string;
  height: number;
  blocktime: number;
  data: {
    amount?: string;
    balance?: string;
    transfer?: string;
    transferMax?: string;
  };
};

export type InscriptionEventsRes = {
  total: number;
  cursor: number;
  detail: ApiEvent[];
};

export type CommitTx = {
  inscriptionId: string;
  txid: string;
  rawtx?: string;
  status: "pending" | "unconfirmed" | "confirmed";
  height: number;
  fee: number;
  feeRate: number;
  parent: string;
  timestamp: number;
};

export type HealthyStatus = {
  fb_brc20_indexer: number;
};
