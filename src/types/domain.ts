import { LoggerLevel } from "../config";
import { Brc20 } from "../contract/brc20";
import { LpRewardPoolMap, LpRewardUserMap } from "../domain/lp-reward";

export type Config = {
  loggerLevel: LoggerLevel;
  cors: boolean;
  db: string;
  createDbIndex: boolean;
  openSwagger: boolean;
  fixedGasPrice: string;
  fixedFeeAmount: string;
  port: number;
  mongoUrl: string;
  openApi: {
    bitcoin: {
      apiKey: string;
    };
    fractal: {
      apiKey: string;
    };
  };
  simpleBridgeApi: {
    bitcoin: {
      url: string;
      host: string;
    };
    fractal: {
      url: string;
      host: string;
    };
  };
  unisatGlobalApi?: {
    url: string;
    host: string;
  };
  openHealthyStatus: boolean;
  mempoolApi: string;
  network: string;
  keyring: {
    sequencerWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    rootWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    btcWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    approveWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    accelerateWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
    fbClaimWallet: {
      address: string;
      wif?: string;
      wifWithKey?: string;
    };
  };
  startHeight: number;
  moduleId: string;
  source: string;
  isContractOnChain: boolean;
  pendingTransferNum: number;
  pendingDepositDirectNum: number; // deposit(direct)api
  pendingDepositMatchingNum: number; // deposit(matching)
  pendingRollupNum: number;
  pendingWithdrawNum: number;
  insertHeightNum: number;
  openCommitPerMinute: boolean;
  commitPerMinute: number;
  commitPerSize: number;
  eventListPerSize: number;
  snapshotPerSize: number;
  enableApiUTXO: boolean;
  verifyCommit: boolean;
  openWhitelistTick: boolean;
  whitelistTick: {
    [key: string]: { depositLimit: string; withdrawLimit: string };
  };
  commitFeeRateRatio: number;
  userFeeRateRatio: number;
  minFeeRate: number;
  verifyCommitInvalidException: boolean;
  verifyCommitCriticalException: boolean;
  verifyCommitFatalNum: number;
  binOpts: string[];
  userWhiteList: string[];
  onlyUserWhiteList: boolean;
  updateHeight1: number;
  initTicks: string[];
  readonly: boolean;
  verifyPerOpt: boolean;
  feeTicks: string[];
  initiatePoolUpdate: boolean;
  skipRebuild: boolean;
  checkStakePoolBalance: boolean;
  filterTicks: string[];
  proxyAddress: string;
  useAvailableUtxoData: boolean;
  compareIndexer: boolean;
  compareIndexerCommitGoForward: number;
  swapExceptionValue: number;
  lpExceptionValue: number;
  swapFeeRate?: string;
  mirror?: boolean;
  initiateRewardCurveUpdate?: boolean;
  initiateUpdateAllBalances?: boolean;
  hideSelectDepositL1Tick: string[];
  balanceWorker: {
    updateIntervalMs: number;
    maxUpdateCount: number;
    concurrentLimit?: number;
  };
  l1SupplyMap: { [tick: string]: number };
};

export enum AddressType {
  P2PK = 4,
  P2PKH = 5,
  P2SH = 6,
  P2WPKH = 7,
  P2WSH = 8,
  P2TR = 9,
}

export type ContractStatus = {
  kLast: {
    [key: string]: string;
  };
};

export type ContractConfig = {
  feeTo: string;
  swapFeeRate1000: string; // eg. 30(=0.3%)
};

export type Balance = { [key: string]: { [key: string]: string } }; // addr -> tick -> amount

export type Pool = {
  [key: string]: { amount0: string; amount1: string; lp: string };
}; // pair -> { amount0, amount1, lp }

export type AddressTickBalance = {
  module: string;
  swap: string;
  pendingSwap: string;
  pendingAvailable: string;
};

export type AddressLpBalance = {
  swap: string;
  lock: string;
};

export type Pair = {
  tick0: string;
  tick1: string;
};

export type SnapshotObj = {
  assets: {
    [assetType: string]: { [tick: string]: Brc20 };
  };
  contractStatus: ContractStatus;
  lpReward: {
    poolMap: LpRewardPoolMap;
    userMap: LpRewardUserMap;
  };
  used: boolean;
};

export type OridinalMsg = {
  module: string;
  parent: string;
  gas_price: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
};

export type HashIdMsg = {
  module: string;
  parent: string;
  prevs: string[];

  gas_price: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
};

export type FuncMsg = {
  id: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
  sig: string;
};
