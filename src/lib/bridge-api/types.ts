enum NetworkType {
  FRACTAL_BITCOIN_MAINNET = "FRACTAL_BITCOIN_MAINNET",
  FRACTAL_BITCOIN_TESTNET = "FRACTAL_BITCOIN_TESTNET",
  BITCOIN_MAINNET = "BITCOIN_MAINNET",
  BITCOIN_TESTNET = "BITCOIN_TESTNET",
  BITCOIN_TESTNET4 = "BITCOIN_TESTNET4",
  BITCOIN_SIGNET = "BITCOIN_SIGNET",
}

export type AssetType = "btc" | "brc20" | "runes" | "alkanes";

export enum BridgeType {
  swap = "swap",
  bridge = "bridge",
}

export type BridgeCreateDepositReq = {
  amount: string;
  address: string;
  pubkey: string;

  l1AssetType: AssetType;
  bridgeType: BridgeType;
  tick: string; // brc20 or runes

  // brc20
  inscriptionId?: string;

  feeRate?: number;
  utxos?: { txid: string; index: number }[];
};

export type BridgeCreateDepositRes = {
  psbt: string;
};

export type BridgeConfirmDepositReq = {
  tick: string;
  amount: string;
  address: string;
  pubkey: string;
  psbt: string;
  l1AssetType: AssetType;
  bridgeType: BridgeType;
};

export type BridgeConfirmDepositRes = {
  txid: string;
};

export type BridgeCreateWithdrawReq = {
  amount: string;
  address: string;
  pubkey: string;
  feeRate?: number;

  l1AssetType: AssetType;
  tick: string; // brc20 or runes

  // brc20
  inscriptionId?: string;
};

export type BridgeCreateWithdrawRes = {
  psbt: string;
  // toSignInputs: ToSignInput[];
};

export type BridgeConfirmWithdrawReq = {
  tick: string;
  amount: string;
  address: string;
  pubkey: string;
  l1AssetType: AssetType;
  funcId: string;
  bridgeType: BridgeType;
};

export type BridgeConfirmWithdrawRes = {};

export type BridgeHistoryReq = {
  address: string;
  type?: "deposit" | "withdraw" | "all";
  txids?: string[];
  start: number;
  limit: number;
  bridgeType?: "bridge" | "swap" | "all";
};

export type BridgeHistoryRes = {
  total: number;
  list: BridgeHistoryItem[];
};

export type BridgeConfigRes = {
  l1: NetworkType;
  l2: NetworkType;
  l1FixedServiceFee: number;
  l2FixedServiceFee: number;
  depositNeedConfirmations: number;
  withdrawNeedConfirmations: number;
  transferNeedConfirmations: number;
  depositLimit: { [l1Tick: string]: number };
  withdrawLimit: { [l2Tick: string]: number };
  l1FeeRate: number;
  l2FeeRate: number;
  assetList: {
    l1Tick: string;
    l1AssetType: AssetType;
    l2Tick: string;
    l2AssetType: AssetType;
  }[];
};

export type BridgeTxStatusReq = {
  txid: string;
  type: "deposit" | "withdraw";
};

export type BridgeTxStatusRes = BridgeHistoryItem & {
  serviceFeeDisplay: string;
  networkFeeDisplay: string;
};

export type BridgeHistoryItem = {
  type: "deposit" | "withdraw";
  l1: string;
  l2: string;
  payTick: string;
  payAmount: string;
  receiveTick: string;
  receiveAmount: string;
  receiveAddress: string;
  serviceFee: string;
  networkFee: string;
  payTxid: string;
  receiveTxid: string;
  status: "pending" | "sending" | "success" | "fail";
  timestamp: number;
  needConfirmations: number;
  curConfirmations: number;
  l1AssetType: AssetType;
  l2AssetType: AssetType;
  funcId: string;
  bridgeType: BridgeType;
};
