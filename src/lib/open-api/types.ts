export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface UTXO {
  address: string;
  codeType: number;
  height: number;
  idx: number;
  inscriptions: {
    inscriptionId: string;
    inscriptionNumber: number;
    isBRC20: boolean;
    moved: boolean;
    offset: number;
    parent?: string;
    isStrip: boolean;
  }[];
  atomicals: {
    atomicalId: string;
    atomicalNumber: number;
    isARC20: boolean;
    ticker: string;
  }[];
  isOpInRBF: boolean;
  satoshi: number;
  scriptPk: string;
  scriptType: string;
  txid: string;
  vout: number;
  parent?: string;
  isStrip: boolean;
}

export interface TickerDetail {
  completeBlocktime: number;
  completeHeight: number;
  confirmedMinted: string;
  confirmedMinted1h: string;
  confirmedMinted24h: string;
  creator: string;
  decimal: number;
  deployBlocktime: number;
  deployHeight: number;
  historyCount: number;
  holdersCount: number;
  inscriptionId: string;
  inscriptionNumber: number;
  inscriptionNumberEnd: number;
  inscriptionNumberStart: number;
  limit: number;
  max: string;
  mintTimes: number;
  minted: string;
  ticker: string;
  totalMinted: string;
  txid: string;
}

export interface InscribeSummary {
  inscribeCount: number;
  ogPassConfirmations: number;
  ogPassCount: number;
  satsCount: number;
  unisatCount: number;
}

export interface InscriptionInfo {
  address: string;
  inscriptionNumber: number;
  inscriptionId: string;
  offset: number;
  contentType: string;
  utxo: {
    address: string;
    txid: string;
    vout: number;
    satoshi: number;
    codeType: number;
    scriptPk: string;
    inscriptions: {
      inscriptionNumber: number;
      inscriptionId: string;
      moved: boolean;
      isBRC20: boolean;
      offset: number;
    }[];
    height: number;
  };
  brc20: {
    amt: string;
    decimal: string;
    lim: string;
    op: string;
    tick: string;
  };
}

export interface NameInfo {
  inscriptionId: string;
  inscriptionName: string;
  inscriptionNameHex: string;
  inscriptionNumber: number;
  inscriptionType: string;
  timestamp: number;
}

export interface HistoryItem {
  amount: string;
  availableBalance: string;
  blockhash: string;
  blocktime: number;
  from: string;
  height: number;
  idx: number;
  inscriptionId: string;
  inscriptionNumber: number;
  overallBalance: string;
  satoshi: number;
  ticker: string;
  to: string;
  transferBalance: string;
  txid: string;
  txidx: number;
  type: string;
  valid: boolean;
  vout: number;
  h: number;
}

export interface BRC20Inscription {
  confirmations: number;
  satoshi: number;
  data: {
    amt: string;
    decimal: string;
    lim: string;
    max: string;
    minted: string;
    op: string;
    tick: string;
  };
  inscriptionId: string;
  inscriptionNumber: number;
}

export type VerifyCommitRes = {
  critical: boolean;
  valid: boolean;
  index?: number;
  id?: string;
  message?: string;
};

// Rune Interfaces
export interface RuneBalance {
  amount: string;
  runeid: string;
  rune: string;
  spacedRune: string;
  symbol: string;
  divisibility: number;
}

// Alkanes Interfaces
export interface OpenApiAlkaneTokenBalance {
  alkaneid: string;
  name: string;
  symbol: string;
  logo: string;
  divisibility: number;
  amount: string;
}

export interface AlkaneEntry {
  alkaneid: string;
  name: string;
  spaced: number;
  height: number;
  divisibility: number;
  symbol: string;
  holders: number;
}

export enum HealthzCode {
  HEALTHY = 0,
  UNHEALTHY = 3,
}

export type HealthyStatus = {
  fb_brc20_indexer: HealthzCode;
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

export enum TickerFilter {
  FOUR_BYTE = "8",
  FIVE_BYTE = "16",
  ALL = "24",
}
