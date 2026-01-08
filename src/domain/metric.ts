import { Gauge, Histogram, Registry } from "prom-client";

export class Metric {
  readonly register: Registry;

  readonly costUtxoBalance: Gauge;
  readonly totalUtxoBalance: Gauge;
  readonly committing: Gauge;
  readonly nextUtxoA: Gauge;
  readonly nextUtxoB: Gauge;
  readonly estimatedCostUtxoA: Gauge;
  readonly estimatedCostUtxoB: Gauge;
  readonly isRestoring: Gauge;
  readonly notInEventList: Gauge;
  readonly commitOpTotal: Gauge;
  readonly curPriceInfo_gasPrice: Gauge;
  readonly curPriceInfo_feeRate: Gauge;
  readonly curPriceInfo_satsPrice: Gauge;
  readonly unCommitInfo_funcNum: Gauge;
  readonly unCommitInfo_gasPrice: Gauge;
  readonly unCommitInfo_feeRate: Gauge;
  readonly unCommitInfo_satsPrice: Gauge;
  readonly withdrawNum: Gauge;
  readonly withdrawErrorNum: Gauge;
  readonly firstAggregateTimestamp: Gauge;
  readonly lastCommitTime: Gauge;
  readonly commitFailCount: Gauge;
  readonly verifyFailCount: Gauge;
  readonly curCommitFuncNum: Gauge;

  // staking
  readonly stakingPoolBalance: Gauge;
  readonly expectedRemainRewards: Gauge;
  readonly expectedDistributeRewards: Gauge;
  readonly realDistributeRewards: Gauge;

  // fee
  readonly gasBalance: Gauge;
  readonly lpTickBalance: Gauge;

  readonly apiMap: { [key: string]: Histogram } = {};

  constructor(register: Registry) {
    this.register = register;

    this.gasBalance = new Gauge({
      name: "gasBalance",
      help: "gasBalance",
      registers: [register],
      labelNames: ["tick"],
    });

    this.lpTickBalance = new Gauge({
      name: "lpTickBalance",
      help: "lpTickBalance",
      registers: [register],
      labelNames: ["pair", "tick"],
    });

    this.realDistributeRewards = new Gauge({
      name: "realDistributeRewards",
      help: "realDistributeRewards",
      registers: [register],
      labelNames: ["pid"],
    });

    this.expectedRemainRewards = new Gauge({
      name: "expectedRemainRewards",
      help: "expectedRemainRewards",
      registers: [register],
      labelNames: ["pid"],
    });

    this.expectedDistributeRewards = new Gauge({
      name: "expectedDistributeRewards",
      help: "expectedDistributeRewards",
      registers: [register],
      labelNames: ["pid"],
    });

    this.stakingPoolBalance = new Gauge({
      name: "stakingPoolBalance",
      help: "stakingPoolBalance",
      registers: [register],
      labelNames: ["pid"],
    });

    this.curCommitFuncNum = new Gauge({
      name: "curCommitFuncNum",
      help: "curCommitFuncNum",
      registers: [register],
    });

    this.verifyFailCount = new Gauge({
      name: "verifyFailCount",
      help: "verifyFailCount",
      registers: [register],
    });

    this.commitFailCount = new Gauge({
      name: "commitFailCount",
      help: "commitFailCount",
      registers: [register],
    });

    this.lastCommitTime = new Gauge({
      name: "lastCommitTime",
      help: "lastCommitTime",
      registers: [register],
    });

    this.costUtxoBalance = new Gauge({
      name: "costUtxoBalance",
      help: "costUtxoBalance",
      registers: [register],
    });

    this.totalUtxoBalance = new Gauge({
      name: "totalUtxoBalance",
      help: "totalUtxoBalance",
      registers: [register],
    });

    this.nextUtxoA = new Gauge({
      name: "nextUtxoA",
      help: "nextUtxoA",
      registers: [register],
    });

    this.nextUtxoB = new Gauge({
      name: "nextUtxoB",
      help: "nextUtxoB",
      registers: [register],
    });

    this.estimatedCostUtxoB = new Gauge({
      name: "estimatedCostUtxo",
      help: "estimatedCostUtxo",
      registers: [register],
    });

    this.estimatedCostUtxoA = new Gauge({
      name: "estimatedCostUtxoA",
      help: "estimatedCostUtxoA",
      registers: [register],
    });

    this.committing = new Gauge({
      name: "committing",
      help: "committing",
      registers: [register],
    });

    this.isRestoring = new Gauge({
      name: "isRestoring",
      help: "isRestoring",
      registers: [register],
    });

    this.notInEventList = new Gauge({
      name: "notInEventList",
      help: "notInEventList",
      registers: [register],
    });

    this.commitOpTotal = new Gauge({
      name: "commitOpTotal",
      help: "commitOpTotal",
      registers: [register],
    });

    this.curPriceInfo_gasPrice = new Gauge({
      name: "curPriceInfo_gasPrice",
      help: "curPriceInfo_gasPrice",
      registers: [register],
    });

    this.curPriceInfo_feeRate = new Gauge({
      name: "curPriceInfo_feeRate",
      help: "curPriceInfo_feeRate",
      registers: [register],
    });

    this.curPriceInfo_satsPrice = new Gauge({
      name: "curPriceInfo_satsPrice",
      help: "curPriceInfo_satsPrice",
      registers: [register],
    });

    this.unCommitInfo_funcNum = new Gauge({
      name: "unCommitInfo_funcNum",
      help: "unCommitInfo_funcNum",
      registers: [register],
    });

    this.unCommitInfo_gasPrice = new Gauge({
      name: "unCommitInfo_gasPrice",
      help: "unCommitInfo_gasPrice",
      registers: [register],
    });

    this.unCommitInfo_feeRate = new Gauge({
      name: "unCommitInfo_feeRate",
      help: "unCommitInfo_feeRate",
      registers: [register],
    });

    this.unCommitInfo_satsPrice = new Gauge({
      name: "unCommitInfo_satsPrice",
      help: "unCommitInfo_satsPrice",
      registers: [register],
    });

    this.withdrawNum = new Gauge({
      name: "withdrawNum",
      help: "withdrawNum",
      registers: [register],
    });

    this.withdrawErrorNum = new Gauge({
      name: "withdrawErrorNum",
      help: "withdrawErrorNum",
      registers: [register],
    });

    this.firstAggregateTimestamp = new Gauge({
      name: "firstAggregateTimestamp",
      help: "firstAggregateTimestamp",
      registers: [register],
    });
  }

  obverse(key: string, value: number) {
    key = key.replace("/", "");
    key = (key as any).replaceAll("/", "_");
    key = (key as any).replaceAll("-", "_");
    if (!this.apiMap[key]) {
      try {
        this.apiMap[key] = new Histogram({
          name: key,
          help: key,
          registers: [this.register],
          buckets: [10, 50, 100, 1000, 3000, 10000, 20000, 30000],
        });
      } catch (err) {
        console.log(err.message, key);
        throw err;
      }
    }
    this.apiMap[key].observe(value);
  }
}
