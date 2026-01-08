import { AddressTickBalance } from "./domain";

import {
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import { CommunityData } from "../dao/community-dao";
import { LpRewardHistoryData } from "../dao/lp-reward-history-dao";
import { MatchingData } from "../dao/matching-dao";
import { RecordLiqData } from "../dao/record-liq-dao";
import { RecordLockLpData } from "../dao/record-lock-lp-dao";
import { RecordSwapData } from "../dao/record-swap-dao";
import { RecordUnlockLpData } from "../dao/record-unlock-lp-dao";
import { RewardCurveData } from "../dao/reward-curve-dao";
import { StakeHistoryData } from "../dao/stake-history-dao";
import { WithdrawStatus, WithdrawType } from "../dao/withdraw-dao";
import { BridgeConfigRes } from "../lib/bridge-api/types";
import { ExactType, FuncType, InscriptionFunc } from "./func";

export type Req<T, T2> = T2 extends "post"
  ? FastifyRequest<{ Body: T; Reply: any }>
  : T2 extends "get"
  ? FastifyRequest<{ Querystring: T; Reply: any }>
  : never;

export type Res<T = any> = FastifyReply<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  { Reply: T }
>;

export type ConfigReq = {};
export type ConfigRes = {
  moduleId: string;
  serviceGasTick: string;
  pendingDepositDirectNum: number;
  pendingDepositMatchingNum: number;
  pendingTransferNum: number;
  userWhiteList: string[];
  onlyUserWhiteList: boolean;
  tickWhiteList: string[];
  onlyTickWhiteList: boolean;
  binOpts: string[];
  commitPerMinute: number;
  feeTicks: string[];
  btcBridgeConfig: BridgeConfigRes;
  fbBridgeConfig: BridgeConfigRes;
};

export type AddressBalanceReq = {
  address: string;
  tick: string;
};
export type AddressBalanceRes = {
  balance: AddressTickBalance;
  decimal: string;
};

export type DepositInfoReq = {
  address: string;
  tick: string;
};

export type DepositInfoRes = {
  dailyAmount: string;
  dailyLimit: string;
  recommendDeposit: string;
};

export type AllAddressBalanceReq = {
  address: string;
  pubkey: string;
};
export type AllAddressBalanceRes = {
  [key: string]: {
    balance: AddressTickBalance;
    decimal: string;
    assetType: AssetType;
    networkType: NetworkType;
    price?: number;
    // withdrawLimit: string;
  };
};

export type QuoteSwapReq = {
  address: string;
  tickIn: string;
  tickOut: string;
  amount: string;
  exactType: ExactType;
};
export type QuoteSwapRes = {
  amountUSD: string;
  expectUSD: string;
  expect: string;
};

export type QuoteMultiSwapRes = {
  amountUSD: string;
  expectUSD: string;
  expect: string;
  routesExpect: string[];
};

export type PoolInfoReq = {
  tick0: string;
  tick1: string;
};
export type PoolInfoRes = {
  existed: boolean;
  addLiq: boolean;
  activedPid: string;
  marketCap: number;
  marketCapTick: string;
  networkType0?: NetworkType;
  networkType1?: NetworkType;
  assetType0?: AssetType;
  assetType1?: AssetType;
  l1Tick0?: string;
  l1Tick1?: string;
} & PoolListItem;

export type SelectReq = {
  address: string;
  search: string;
};

export type SelectRes = {
  tick: string;
  decimal: string;
  brc20Balance: string;
  swapBalance: string;
}[];

export type DeployPoolReq = {
  address: string;
  tick0: string;
  tick1: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};
export type DeployPoolRes = {
  //
  //
};

export type QuoteAddLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
};

export type QuoteAddLiqRes = {
  amount0: string;
  amount1: string;
  amount0USD: string;
  amount1USD: string;
  lp: string;
  tick0PerTick1: string;
  tick1PerTick0: string;
  shareOfPool: string;
};

export type AddLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  feeTick: string;
  lp: string;
  slippage: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};
export type AddLiqRes = RecordLiqData;

export type QuoteRemoveLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  lp: string;
};

export type QuoteRemoveLiqRes = {
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  amount0USD: string;
  amount1USD: string;
};

export type RemoveLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  lp: string;
  amount0: string;
  amount1: string;
  feeTick: string;
  slippage: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};
export type RemoveLiqRes = RecordLiqData;

export type SwapReq = {
  address: string;
  tickIn: string;
  tickOut: string;
  amountIn: string;
  amountOut: string;
  feeTick: string;
  slippage: string;
  exactType: ExactType;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;

  // asset fee tick
  assetFeeAmount?: string;
  assetFeeTick?: string;
  assetFeeTickPrice?: string;
};
export type SwapRes = RecordSwapData;

export type FuncReq =
  | {
      func: FuncType.swap;
      req: SwapReq;
    }
  | {
      func: FuncType.addLiq;
      req: AddLiqReq;
    }
  | {
      func: FuncType.deployPool;
      req: DeployPoolReq;
    }
  | {
      func: FuncType.removeLiq;
      req: RemoveLiqReq;
    }
  | {
      func: FuncType.decreaseApproval;
      req: DecreaseApprovalReq;
    }
  | {
      func: FuncType.lock;
      req: LockReq;
    }
  | {
      func: FuncType.unlock;
      req: UnlockReq;
    }
  | {
      func: FuncType.claim;
      req: ClaimReq;
    }
  | {
      func: FuncType.send;
      req: SendReq;
    }
  | {
      func: FuncType.sendLp;
      req: SendReq;
    };

export type BatchFuncReq = {
  func: FuncType.send;
  req: BatchSendReq;
};

export type PoolListReq = {
  search?: string;
  sort?: "tvl" | "24h" | "7d" | "30d";
  start: number;
  limit: number;
};

export type PoolListItem = {
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  lp: string;
  tvl: string;
  volume24h: string;
  volume7d: string;
  volume30d: string;
  reward0: string;
  reward1: string;
};

export type PoolListRes = {
  total: number;
  list: PoolListItem[];
};

export type StakeItemReq = {
  eid: string;
};

export type StakeItemRes = { item: Epoch; newestHeight: number };

export type StakeListReq = {};

export type Epoch = {
  eid: string;
  startBlock: number;
  endBlock: number;
  stakePools: {
    summary: StakePoolSummaryInfo;
  }[];
};

export type StakePoolSummaryInfo = {
  pid: string;
  poolTick0: string;
  poolTick1: string;
  rewardTick: string;
  curTotalLp: string;
  baseReward: string;
  stageNeedLp: string[];
  stageAddedRewards: string[];
  stakingLimit: string;
  distributedReward: string;
  extractReward: string;
  extractDistributedReward: string;
  apy: number;
};

export type StakePoolUserInfo = {
  pid: string;
  address: string;
  availableLp: string;
  stakedLp: string;
  claimed: string;
  unclaimed: string;
  lastStakeTs: number;
};

export type StakeListRes = { list: Epoch[]; newestHeight: number };

export type StakeUserInfoReq = {
  address: string;
};

export type StakeUserInfoRes = {
  [pid: string]: StakePoolUserInfo;
};

export type StakeHistoryType = "all" | "stake" | "unstake" | "claim";

export type StakeHistoryReq = {
  pid?: string;
  search?: string;
  address: string;
  type: StakeHistoryType;
  start: number;
  limit: number;
};

export type StakeHistoryRes = {
  total: number;
  list: StakeHistoryData[];
};

export type MyPoolListReq = {
  address: string;
  tick?: string;
  start: number;
  limit: number;
  sortField?: "tvl" | "24h" | "7d" | "30d" | "liq";
  sortType?: "asc" | "desc";
};

export type MyPoolListItem = {
  lp: string;
  lpUSD: string;
  lockedLp: string;
  activedPid?: string;
  shareOfPool: string;
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  claimedReward0: string;
  claimedReward1: string;
  unclaimedReward0: string;
  unclaimedReward1: string;
  tvl?: number;
  volume24h?: number;
  volume7d?: number;
  volume30d?: number;
};

export type MyPoolListRes = {
  total: number;
  totalLpUSD: string;
  list: MyPoolListItem[];
};

export type MyPoolReq = {
  address: string;
  tick0: string;
  tick1: string;
  ts?: number;
};

export type MyPoolRes = MyPoolListItem;

export type LpRewardHistoryReq = {
  address: string;
  tick0: string;
  tick1: string;
  start: number;
  limit: number;
};

export type LpRewardHistoryRes = {
  total: number;
  list: LpRewardHistoryData[];
};

export type DepositListReq = {
  address?: string;
  pubkey?: string;
  tick?: string;
  txid?: string;
  start: number;
  limit: number;
};

export type DepositType = "direct" | "matching" | "bridge";

export type DepositListItem = {
  tick: string;
  amount: string;
  cur: number;
  sum: number;
  ts: number;
  txid: string;
  type: DepositType;
  status: DepositItemStatus;
  originTick: string;
  originNetworkType: NetworkType;
  originAssetType: AssetType;
};

export enum DepositItemStatus {
  pending = "pending",
  success = "success",
}

export type DepositListRes = {
  total: number;
  list: DepositListItem[];
};

export type SendHistoryReq = {
  address: string;
  tick: string;
  fuzzySearch?: boolean;
  start: number;
  limit: number;
};

export type SendHistoryItem = {
  tick: string;
  amount: string;
  to: string;
  ts: number;
};

export type SendHistoryRes = {
  total: number;
  list: SendHistoryItem[];
};

export type LiqHistoryReq = {
  address: string;
  tick: string;
  fuzzySearch?: boolean;
  type: "add" | "remove";
  start: number;
  limit: number;
  ts?: number;
};

export type LiqHistoryItem = {
  type: "add" | "remove";
  tick0: string;
  tick1: string;
  amount0: string;
  amount1: string;
  reward0?: string;
  reward1?: string;
  lp: string;
  ts: number;
};

export type LiqHistoryRes = {
  total: number;
  list: LiqHistoryItem[];
};

export type GasHistoryReq = {
  address: string;
  start: number;
  limit: number;
};

export type GasHistoryRes = {
  total: number;
  list: GasHistoryItem[];
};

export type OverViewReq = {};

export type OverViewRes = {
  liquidity: string;
  volume7d: string;
  volume24h: string;
  transactions: number;
  pairs: number;
};

export type SwapHistoryReq = {
  address: string;
  tick: string;
  fuzzySearch?: boolean;
  start: number;
  limit: number;
};

export type SwapHistoryItem = {
  tickIn: string;
  tickOut: string;
  amountIn: string;
  amountOut: string;
  exactType: ExactType;
  ts: number;
};

export type MultiSwapHistoryItem = {
  id?: string;
  tickIn: string;
  tickOut: string;
  amountIn: string;
  amountOut: string;
  exactType: ExactType;
  ts: number;
  success: boolean;
  failureReason?: string;
};

export type SwapHistoryRes = {
  total: number;
  list: SwapHistoryItem[];
};

export type MultiSwapHistoryResItem = {
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

export type MultiSwapHistoryRes = {
  total: number;
  list: MultiSwapHistoryResItem[];
};

export type RollUpHistoryReq = {
  start: number;
  limit: number;
};

export type RollUpHistoryItem = {
  cursor?: number;
  txid: string;
  height: number;
  transactionNum: number;
  inscriptionId: string;
  inscriptionNumber: number;
  ts: number;
  inscriptionFuncItems: InscriptionFuncItem[];
};
export type InscriptionFuncItem = {
  id: string;
  addr: string;
  func: string;
  params: string[];
  ts: number;
  tag: string;
  lockDay?: number;
};
export type RollUpHistoryRes = {
  total: number;
  list: RollUpHistoryItem[];
};

export type PreRes = {
  ids: string[];
  signMsgs: string[];

  // feeTick
  feeAmount: string;
  feeTick: string;
  feeTickPrice: string;
  feeBalance: string;

  // free quota
  totalFreeQuota: string;
  remainingFreeQuota: string;
  totalUsedFreeQuota: string;
  usageFreeQuota: string;

  usdPrice: string;
  hasVoucher: boolean;

  // swap tick
  assetFeeAmount?: string;
  assetFeeTick?: string;
  assetFeeTickPrice?: string;
  assetFeeTickBalance?: string;
};

export type PreSendLpRes = PreRes & {
  amount0PerLp: string;
  amount1PerLp: string;
};

export type PreRemoveLiqRes = PreRes & { reward0: string; reward1: string };

export enum PayType {
  fb = "fb",
  freeQuota = "freeQuota",
  tick = "tick",
  assetFeeTick = "assetFeeTick",
}

export type CreateDepositReq = {
  inscriptionId?: string;
  feeRate?: number;
  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  assetType: AssetType;
  networkType: NetworkType;
};

export type CreateDepositRes = {
  psbt: string;
  type: DepositType;
  expiredTimestamp: number;
  recommendDeposit: string;
};

export type ConfirmDepositReq = {
  inscriptionId?: string;
  psbt: string;
  pubkey: string;
  address: string;
  feeRate: number;
  tick: string;
  amount: string;
  assetType: AssetType;
  networkType: NetworkType;
};

export type ConfirmDepositRes = {
  txid: string;
  pendingNum: number;
};

export type SystemStatusReq = {};

export type SystemStatusRes = {
  committing: boolean;
};

export type WithdrawHistoryReq = {
  address: string;
  pubkey?: string;
  tick?: string;
  start: number;
  limit: number;
};

export type ConditionalWithdrawHistoryItem = {
  id: string;
  tick: string;
  totalAmount: string;
  completedAmount: string;
  ts: number;
  totalConfirmedNum: number;
  totalNum: number;
  status: WithdrawStatus;
  type: WithdrawType;
  originTick: string;
  originNetworkType: NetworkType;
  originAssetType: AssetType;
};

export type WithdrawHistoryRes = {
  total: number;
  list: ConditionalWithdrawHistoryItem[];
};

export type CreateConditionalWithdrawReq = {
  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  ts: number;
  feeTick: string;
};

export type CreateConditionalWithdrawRes = {
  id: string;
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
} & PreRes;

export type CreateDirectWithdrawReq = {
  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  ts: number;
  feeTick: string;
  payType: PayType;
  feeRate?: number;
  assetType: AssetType;
  networkType: NetworkType;
};

export type ConfirmDirectWithdrawReq = {
  id: string;
  paymentPsbt: string;
  approvePsbt: string;
  feeTick: string;
  feeAmount: string;
  feeTickPrice: string;
  sigs: string[];
  ts: number;
  payType: PayType;
  rememberPayType?: boolean;

  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  assetType: AssetType;
  networkType: NetworkType;
};

export type CreateDirectWithdrawRes = {
  id: string;
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
  assetType: AssetType;
  networkType: NetworkType;
  originTick: string;
  approvePsbtSignIndexes: number[];
} & PreRes;

export type ConfirmWithdrawRes = {};

export type CreateRetryWithdrawReq = {
  id: string;
  pubkey: string;
  address: string;
};

export type CreateRetryWithdrawRes = {
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
};

export type ConfirmRetryWithdrawReq = {
  id: string;
  paymentPsbt: string;
  approvePsbt: string;
};

export type ConfirmRetryWithdrawRes = {};

export type CreateCancelWithdrawReq = {
  id: string;
};

export type CreateCancelWithdrawRes = {
  id: string;
  psbt: string;
  networkFee: number;
};

export type ConfirmCancelWithdrawReq = {
  id: string;
  psbt: string;
};

export type ConfirmCancelWithdrawRes = {};

export type WithdrawProcessReq = {
  id: string;
};

export type WithdrawProcessRes = {
  type: WithdrawType;
  id: string;
  tick: string;
  amount: string;
  ts: number;
  status: WithdrawStatus;

  totalConfirmedNum: number;
  totalNum: number;
  rollUpConfirmNum: number;
  rollUpTotalNum: number;
  approveConfirmNum: number;
  approveTotalNum: number;
  cancelConfirmedNum: number;
  cancelTotalNum: number;

  rollUpTxid: string;
  paymentTxid: string;
  inscribeTxid: string;
  approveTxid: string;

  completedAmount: string;
  matchHistory: MatchingData[];

  rank: number;
};

export type DecreaseApprovalReq = {
  address: string;
  tick: string;
  amount: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type LockReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount: string;
  feeTick: string;
  ts: number;
  lockTime?: string;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type LockRes = {};

export type UnlockReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type UnlockRes = {};

export type StakeReq = {
  pid: string;
  address: string;
  amount: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type StakeRes = {};

export type UnstakeReq = {
  pid: string;
  address: string;
  amount: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type UnstakeRes = {};

export type ClaimReq = {
  pid: string;
  address: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type ClaimRes = {
  amount: string;
};

export type SendReq = {
  address: string;
  tick: string;
  amount: string;
  feeTick: string;
  to: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;

  assetFeeAmount?: string;
  assetFeeTick?: string;
  assetFeeTickPrice?: string;
};

export type SendLpReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount: string;
  feeTick: string;
  to: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};

export type SendRes = {};

export type DecreaseApprovalRes = {};

export type GasHistoryItem = {
  funcType: FuncType;
  tickA: string;
  tickB: string;
  gas: string;
  tick: string;
  ts: number;
  to?: string;
};

export type SignMsgRes = {
  id: string;
  prevs: string[];
  signMsg: string;
}[];

export type UserInfoReq = {
  address: string;
};

export type UserInfoRes = {
  defaultPayType: PayType;
  rememberPayType: boolean;
};

export type FuncInfoReq = {
  id: string;
};

export type FuncInfoRes = InscriptionFunc;

export type SelectDepositReq = {
  pubkey?: string;
  address: string;
  v?: string;
};

export enum NetworkType {
  FRACTAL_BITCOIN_MAINNET = "FRACTAL_BITCOIN_MAINNET",
  FRACTAL_BITCOIN_TESTNET = "FRACTAL_BITCOIN_TESTNET",
  BITCOIN_MAINNET = "BITCOIN_MAINNET",
  BITCOIN_TESTNET = "BITCOIN_TESTNET",
  BITCOIN_TESTNET4 = "BITCOIN_TESTNET4",
  BITCOIN_SIGNET = "BITCOIN_SIGNET",
}

export type AssetType = "btc" | "brc20" | "runes" | "alkanes";

export type SwapAssetItem = {
  tick: string;
  brc20Tick: string;
  assetType: AssetType;
  networkType: NetworkType;
  swapBalance: AddressTickBalance;
  externalBalance: {
    balance: string;
    unavailableBalance?: string;
    divisibility: string;
    brc20: {
      available: string;
      transferable: string;
    };
  };
  alkanesName?: string;
};

export type SelectDepositRes = {
  bitcoin: {
    native: SwapAssetItem[];
    brc20: SwapAssetItem[];
    runes: SwapAssetItem[];
    alkanes: SwapAssetItem[];
  };
  fractal: {
    native: SwapAssetItem[];
    brc20: SwapAssetItem[];
    runes: SwapAssetItem[];
  };
};

export type DepositBalanceReq = {
  pubkey: string;
  address: string;
  tick: string;
};

export type DepositBalanceRes = SwapAssetItem;

export type DepositProcessReq = {
  txid: string;
};

export type DepositProcessRes = DepositListItem;

export type TickPriceReq = {
  tick: string;
};

export type TickPriceRes = {
  price: number;
};

export type AddressGasReq = {
  address: string;
  feeTick: string;
};

export type AddressGasRes = {
  total: number;
};

export type PriceLineReq = {
  tick0: string;
  tick1: string;
  timeRange: "24h" | "7d" | "30d" | "90d";
};

export type PriceLineRes = {
  list: {
    price: number;
    usdPrice: number;
    ts: number;
  }[];
  total: number;
};

export type CommunityInfoReq = {
  tick: string;
};

export type CommunityInfoRes = CommunityData;

export type CommunityListReq = {};

export type CommunityListRes = {
  total: number;
  list: CommunityData[];
};

export type AddCommunityInfoReq = {
  tick: string;
  twitter: string;
  telegram: string;
  website: string;
  discord: string;
  desc: string;
};

export type AddCommunityInfoRes = {};

export type TickHoldersReq = {
  tick: string;
  start: number;
  limit: number;
};
export type TickHoldersRes = {
  total: number;
  list: {
    address: string;
    amount: string;
    percentage: number;
    relativePercentage: number;
  }[];
};

export type PoolHoldersReq = {
  tick0: string;
  tick1: string;
  start: number;
  limit: number;
};
export type LockLpItem = {
  lp: string;
  amount0: string;
  amount1: string;
};
export type PoolHoldersRes = {
  total: number;
  list: {
    address: string;
    amount0: string;
    amount1: string;
    lp: string;
    shareOfPool: number;
    lockLp: LockLpItem;
  }[];
};

export type BatchSendReq = {
  address: string;
  tick: string;
  amount?: string;
  amountList?: string[];
  feeTick: string;
  to: string[];
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
  checkBalance?: boolean;
};

export type BatchSendRes = {};

export type RewardCurveReq = {
  address: string;
  tick0: string;
  tick1: string;
  startTime: number;
  endTime: number;
};

export type RewardCurveRes = {
  total: number;
  list: RewardCurveData[];
};

export type BurnHistoryReq = {
  address: string;
  tick: string;
  fuzzySearch?: boolean;
  start: number;
  limit: number;
  ts?: number;
};

export type BurnHistoryItem = {
  tick: string;
  amount: string;
  to: string;
  ts: number;
};

export type BurnHistoryRes = {
  total: number;
  list: BurnHistoryItem[];
  totalLp: string;
  burnedLp: string;
};

export type SendLpHistoryReq = {
  address: string;
  tick: string;
  fuzzySearch?: boolean;
  start: number;
  limit: number;
};
export type SendLpResult = {
  amount0: string;
  amount1: string;
  lp: string;
  value: number;
};
export type SendLpHistoryItem = {
  address: string;
  tick: string;
  amount: string;
  to: string;
  ts: number;
  sendLpResult: SendLpResult;
};
export type SendLpHistoryRes = {
  total: number;
  list: SendLpHistoryItem[];
};

export type TaskListReq = {
  tid?: string;
  address: string;
};

export type TaskListRes = {
  tid: string;
  list: TaskItem[];
  startTime: number;
  endTime: number;
};

export type TaskItem = {
  tid: string;
  itemId: string;
  address: string;
  done?: boolean;
};

export enum TitleId {
  Fractal_Christmas_Carnival_2024_Stamp_Collector_Club = 0,
  Bitcoin_Tech_Carnival,
  Bitcoin_Wizard_NFT_Diamond_Hand,
  WZRD_brc_20_Diamond_Hand,
  UniSat_Community_Champion,
  UniSat_OG_Pass_Diamond_Hand,
  UniSat_Points_Hodler_500,
  PIZZA_brc_20_Diamond_Hand,
  Early_Contributor_to_brc_20_Swap_Module,
  Fractal_Community_Champion,
  Fractal_Inaugural_Voters,
  Prime_Access_Pass_Diamond_Hand,
  Early_Access_Pass_Diamond_Hand,
  UniSat_Emblem_Diamond_Hand,
  UniSat_Discord_Contributor,
  Slice_Key_2025,
  Crust_Connoisseur,
  Pizza_Node_Operator,
  Satoshi_Slice_Enthusiast,
  Blockchain_Baker,
  Peer_to_Peer_Pizza_Patron,
  Week_1,
  UniHexa_Invite_Only_Beta_Access_Pass,
  Week_2,
  Week_3,
  Week_4,
  Week_5,
}

export enum TitleType {
  Diamond_Hand = 0,
  Product_Pioneer,
  Community_Builder,
  Pizza_Day_2025,
  The_Journey_of_a_Bitcoin_Alchemist,
}

export type TitleInfoData = {
  id: TitleId;
  name: string;
  type: TitleType;
  icon: string;
  desc: string;
  notOpen?: boolean;
  hide?: boolean;
  timestamp?: number; // Unified distribution time
};

export type MyTitlesV2Req = {
  address: string;
};

export type MyTitlesV2Res = {
  myTitles: number;
  allTitles: number;
  titles: (TitleInfoData & {
    isEligible: boolean;
    claimed: boolean;
    data?: any;
  })[];
};

export type AssetsUSDReq = {
  address: string;
};
export type AssetsUSDRes = {
  assetsUSD: string;
  lpUSD: string;
};

export type PreLockLpRes = PreRes & {
  amount0PerLp: string;
  amount1PerLp: string;
};
export type LockLpReq = {
  address: string;
  lockDay: string;
  tick0: string;
  tick1: string;
  amount: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};
export type LockLpRes = {};

export type PreUnlockLpRes = PreRes & {
  amount0PerLp: string;
  amount1PerLp: string;
};
export type UnLockLpReq = {
  address: string;
  tick0: string;
  tick1: string;
  amount: string;
  feeTick: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: PayType;
  rememberPayType?: boolean;
};
export type UnLockLpRes = {};

export type LockLpHistoryReq = {
  tick?: string;
  tick0?: string;
  tick1?: string;
  start: number;
  limit: number;
  address?: string;
  lockDay?: number;
};
export type RecordLockLpItem = {
  shareOfPool: string;
} & RecordLockLpData;
export type LockLpHistoryRes = {
  total: number;
  list: RecordLockLpItem[];
};

export type UnlockLpHistoryReq = {
  tick?: string;
  tick0?: string;
  tick1?: string;
  start: number;
  limit: number;
  address?: string;
};
export type UnlockLpHistoryRes = {
  total: number;
  list: RecordUnlockLpData[];
};

export type UserLockLpInfoReq = {
  tick0: string;
  tick1: string;
  address: string;
};
export type UserLockLpInfoRes = {
  lp: string;
  lockLp: string;
  availableLp: string;
  availableUnlockLp: string;
  availableAmount0: string;
  availableAmount1: string;
  shareOfPool: string;
};

export type ExportLockLpHistoryReq = {
  tick0: string;
  tick1: string;
  lockDay?: number;
  lockTime?: number;
};
export type ExportLockLpHistoryRes = {
  fileName: string;
  csvContent: string;
};

export type MultiSwapReq = {
  items: SwapReq[];
};
export type MultiSwapRes = {
  address: string;
  tickIn: string;
  tickOut: string;
  success: boolean;
  amountIn?: string;
  amountOut?: string;
  exactType?: ExactType;
  value?: number;
  ts?: number;
  failureReason?: string;
};

export type SelectPoolReq = {
  address: string;
  tickIn?: string;
  tickOut?: string;
  search?: string;
};

export type SelectPoolRes = {
  tick: string;
  decimal: string;
  brc20Balance: string;
  swapBalance: string;
  routes?: string[];
}[];
