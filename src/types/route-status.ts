import { DepositData } from "../dao/deposit-dao";
import { MatchingData } from "../dao/matching-dao";
import { WithdrawData } from "../dao/withdraw-dao";

export type StatusAssetsReq = {
  address: string;
  tick: string;
};

export type StatusSwapReq = {
  address: string;
  tick: string;
  startTime: number;
  endTime: number;
  displayResult: boolean;
  start: number;
  limit: number;
};

export type StatusLiqReq = {
  address: string;
  tick0: string;
  tick1: string;
  type: "add" | "remove";
  startTime: number;
  endTime: number;
  displayResult: boolean;
  start: number;
  limit: number;
};

export type StatusWithdrawReq = {
  address: string;
  tick: string;
  inscriptionId: string;
  startTime: number;
  endTime: number;
  start: number;
  limit: number;
};

export type StatusWithdrawMatching = {
  "matching-data": Partial<MatchingData & { date: string }>;
  deposit: Partial<DepositData & { date: string }>;
};

export type StatusWithdrawRes = {
  total: number;
  list: {
    withdraw: Partial<WithdrawData & { date: string }>;
    matching: StatusWithdrawMatching[];
  }[];
  statistic: {
    [key: string]: { [key: string]: { tick: string; remain: string } };
  };
  statisticTotal: {
    [key: string]: string;
  };
};

export type StatusStatisticReq = {
  tick: string;
  startTs?: number;
  endTs?: number;
};

export type StatusStatisticRes = {};

export type StatusDepositReq = {
  address: string;
  tick: string;
  inscriptionId: string;
  startTime: number;
  endTime: number;
  start: number;
  limit: number;
};

export type StatusDepositMatching = {
  "matching-data": Partial<MatchingData & { date: string }>;
  withdraw: Partial<WithdrawData & { date: string }>;
};

export type StatusDepositRes = {
  total: number;
  list: {
    deposit: Partial<DepositData & { date: string }>;
    matching: StatusDepositMatching[];
    matchingStatistic: string;
  }[];
  statistic: {
    [key: string]: { [key: string]: { tick: string; remain: string } };
  };
  statisticTotal: {
    [key: string]: string;
  };
};

export type StatusStatusReq = {};

export type StatusStatusRes = {
  commiting: boolean;
  isRestoring: boolean;
  notInEventList: number;
  notInEventIds: string[];
  commitOpTotal: number;
  curPriceInfo: {
    gasPrice: string;
    feeRate: string;
    satsPrice: string;
  };
  unCommitInfo: {
    funcNum: number;
    gasPrice: string;
    feeRate: string;
    satsPrice: string;
  };
  lastCommitInfo: {
    funcNum: number;
    gasPrice: string;
    feeRate: string;
    satsPrice: string;
    inscriptionId: string;
  };
  sequencerUTXOAInfo: {
    totalCount: number;
    totalAmount: number;
    nextUTXOAmount: number;
    utxos: { txid: string; vout: number; satoshi: number }[];
  };
  sequencerUTXOBInfo: {
    totalCount: number;
    totalAmount: number;
    nextUTXOAmount: number;
    utxos: { txid: string; vout: number; satoshi: number }[];
  };
  withdrawNum: number;
  withdrawErrorNum: number;
  lastAggregateTimestamp: number;
  apiStatistic: {
    [key: string]: {
      min: number;
      avg: number;
      max: number;
      errNum: number;
      total: number;
      last: number;
    };
  };
};

export type OpsRangeStatsReq = {
  startTime: number;
  endTime: number;
  sort:
    | "rangeVolumeValue"
    | "rangeLpAddressCount"
    | "rangeSwapAddressCount"
    | "rangeLockedLpValue"
    | "rangeLockedLpAddress";
};

export type OpsRangeStatsRes = {
  pair: string;
  // range
  rangeVolumeValue: number;
  rangeLpAddressCount: number;
  rangeSwapAddressCount: number;
  rangeLockedLpValue: number;
  rangeLockedLpAddress: number;
}[];

export type OpsRangeNetInflowReq = {
  startTime: number;
  endTime: number;
};

export type OpsRangeNetInflowRes = {
  tick: string;
  deposit: number;
  withdraw: number;
  netInflow: number;
  value: number;
}[];

export type OpsCurStatsReq = {};

export type OpsCurStatsRes = {
  pair: string;
  totalVolumeValue: number;
  totalTvlValue: number;
  lpAddressMap: { [lockedLpValue: string]: number };
  totalLockedLpValue: number;
}[];

export type OpsTimeStatsReq = {
  timestamp: number;
};

export type OpsTimeStatsRes = {
  pair: string;
  totalVolumeValue: number;
  totalTvlValue: number;
  lpAddressMap: { [lockedLpValue: string]: number };
  totalLockedLpValue: number;
}[];
