import _ from "lodash";
import hash from "object-hash";
import {
  bn,
  bnDecimal,
  bnDecimalPlacesValid,
  bnUint,
  decimalCal,
  uintCal,
} from "../contract/bn";
import {
  convertPairStrV2ToPairStrV1,
  getPairStrV2,
} from "../contract/contract-utils";
import { OpCommitData } from "../dao/commit-dao";
import { PayData } from "../dao/pay-dao";
import { EventType } from "../types/api";
import { OridinalMsg } from "../types/domain";
import {
  ContractResult,
  ExactType,
  FuncType,
  InternalFunc,
  Result,
} from "../types/func";
import { CommitOp, OpEvent, OpType } from "../types/op";
import {
  BatchFuncReq,
  FuncReq,
  PayType,
  PreRes,
  QuoteAddLiqReq,
  QuoteAddLiqRes,
  QuoteMultiSwapRes,
  QuoteRemoveLiqReq,
  QuoteRemoveLiqRes,
  QuoteSwapReq,
  QuoteSwapRes,
  SignMsgRes,
  SwapReq,
} from "../types/route";
import { isProportional, lastItem, sleep } from "../utils/utils";
import { AssetProcessingData } from "./builder";
import {
  DEFAULT_GAS_TICK,
  LP_DECIMAL,
  PENDING_CURSOR,
  PRICE_DECIMAL,
  UNCONFIRM_HEIGHT,
} from "./constant";
import {
  convertFuncInscription2Internal,
  convertFuncInternal2Inscription,
  convertReq2Arr,
  convertReq2Map,
} from "./convert-struct";
import {
  CodeEnum,
  current_operations_are_not_allowed,
  expired_data,
  insufficient_liquidity,
  invalid_amount,
  liquidity_too_low,
  maximum_precision,
  params_error,
  paramsMissing,
  pool_not_found,
  sign_fail,
  system_commit_in_progress_1,
  system_commit_in_progress_2,
  system_fatal_error,
  system_recovery_in_progress,
  validation_error,
  wait_for_rollup,
} from "./error";
import { getSignMsg, isSignVerify } from "./sign";
import { Space, SpaceType } from "./space";
import {
  batchReqToReqs,
  checkAccess,
  checkAddressType,
  checkAmount,
  checkFuncReq,
  estimateBatchServerFee,
  estimateServerFee,
  getPoolLp,
  getSatsPrice,
  isFreeFeeAddr,
  isLp,
  maxAmount,
  need,
  record,
} from "./utils";

function getPrecisionTip(tick: string, decimal: string) {
  return `${maximum_precision} ${tick}: ${decimal}`;
}

const TAG = "operator";

export class Operator {
  private pendingSpace: Space;
  private newestCommitData: OpCommitData;
  private firstAggregateTimestamp = Date.now();
  private lastAggregateTimestamp: number;
  private tryCommitCount = 0;
  private verifyFailCount = 0;
  private lastCommitTime = Date.now();
  readonly preResMap: { [id: string]: { res: PreRes; timestamp: number } } = {};

  get FirstAggregateTimestamp() {
    return this.firstAggregateTimestamp;
  }

  get LastCommitTime() {
    return this.lastCommitTime;
  }

  get VerifyFailCount() {
    return this.verifyFailCount;
  }

  get NewestCommitData() {
    return this.newestCommitData;
  }

  get PendingSpace() {
    return this.pendingSpace;
  }

  get LastAggregateTimestamp() {
    return this.lastAggregateTimestamp;
  }

  constructor() {}

  private async getUnConfirmedCommitDataFrom(inscriptionId: string) {
    let ret = await opCommitDao.findFrom({ inscriptionId }, false);
    // need(ret.length > 0, null, null, true);

    // use memory data
    ret = ret.filter((item) => {
      return item.op.parent !== this.NewestCommitData.op.parent;
    });
    if (!config.readonly && !config.mirror) {
      ret.push(this.NewestCommitData);
    }
    return ret;
  }

  private async getUnConfirmedOpCommitData(goForward: number) {
    let ret = await opCommitDao.findNotInIndexer(goForward);

    // use memory data
    ret = ret.filter((item) => {
      return item.op.parent !== this.NewestCommitData.op.parent;
    });
    ret.push(this.NewestCommitData);
    return ret;
  }

  async getUnConfirmedOpCommitIds() {
    const res = await opCommitDao.findNotInIndexer();
    let ret = res.map((v) => v.inscriptionId);
    ret = ret.filter((a) => {
      return !!a;
    });
    return ret;
  }

  private async getVerifyCommits(newestCommit: CommitOp) {
    // There may be a delay in commit inscription indexing
    const goForward = config.compareIndexerCommitGoForward || 0;
    let arr = await this.getUnConfirmedOpCommitData(goForward);
    let commits = arr.map((item) => {
      return item.op;
    });

    // use memory data
    commits = commits.filter((item) => {
      return item.parent !== newestCommit.parent;
    });
    commits.push(newestCommit);

    return commits;

    // let ret = commits.map((item) => {
    //   return JSON.stringify(item);
    // });
    // return ret;
  }

  async init() {
    this.lastAggregateTimestamp = Date.now();
    if (this.NewestCommitData.op.data.length > 0) {
      this.firstAggregateTimestamp = this.NewestCommitData.op.data[0].ts * 1000;
      this.lastAggregateTimestamp =
        lastItem(this.NewestCommitData.op.data).ts * 1000;
    } else {
      this.lastAggregateTimestamp = Date.now();
    }
  }

  async handleEvent(event: OpEvent, handleCommit: boolean) {
    if (event.op.op == OpType.commit) {
      logger.debug({
        tag: TAG,
        msg: "handle op commit",
        parent: (event.op as CommitOp).parent,
      });
    }
    let result: ContractResult[] = [];

    // The commit may have already been pre-processed in the aggregation operation
    if (event.op.op == OpType.commit && !handleCommit) {
      this.pendingSpace.checkAndUpdateEventCoherence(event);
    } else {
      result = this.pendingSpace.handleEvent(
        event,
        /*2*/ (item) => {
          let commitParent: string;
          if (event.op.op == OpType.commit) {
            commitParent = event.op.parent;
          }
          const cursor = event.cursor;
          const height = event.height;
          const opType = event.op.op;

          let tickDecimal: string;
          if (isLp(item.raw.tick)) {
            tickDecimal = LP_DECIMAL;
          } else {
            tickDecimal = decimal.get(item.raw.tick);
          }
          (item.processing as AssetProcessingData) = {
            cursor,
            height,
            displayBalance: bnDecimal(item.raw.balance, tickDecimal),
            commitParent,
            opType,
          };
        }
      );

      // update asset dao
      try {
        await mongoUtils.startTransaction(async (session) => {
          const assetList = this.pendingSpace.NotifyDataCollector.AssetList;
          for (let i = 0; i < assetList.length; i++) {
            const item = assetList[i];
            let tickDecimal: string;
            if (isLp(item.raw.tick)) {
              tickDecimal = LP_DECIMAL;
            } else {
              tickDecimal = decimal.get(item.raw.tick);
            }
            await assetDao.upsertData(
              {
                assetType: item.raw.assetType,
                tick: item.raw.tick,
                address: item.raw.address,
                balance: item.raw.balance,
                cursor: PENDING_CURSOR,
                height: UNCONFIRM_HEIGHT,
                commitParent: this.newestCommitData.op.parent,
                displayBalance: bnDecimal(item.raw.balance, tickDecimal),
              },
              { session }
            );
            await assetSupplyDao.upsertData(
              {
                cursor: PENDING_CURSOR,
                height: UNCONFIRM_HEIGHT,
                commitParent: this.newestCommitData.op.parent,
                tick: item.raw.tick,
                assetType: item.raw.assetType,
                supply:
                  this.pendingSpace.Assets.dataRefer()[item.raw.assetType][
                    item.raw.tick
                  ]?.Supply || "0",
              },
              { session }
            );
          }
        });
        this.pendingSpace.NotifyDataCollector.reset(
          this.pendingSpace.LastHandledApiEvent?.cursor || 0
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "asset-update-fail-3",
          error: err.message,
          stack: err.stack,
        });
      }
    }
    return result;
  }

  async resetPendingSpace(space: Space) {
    /**
     * Under what circumstances would the pendingSpace be reset:
     * - Initialization at startup
     * - Reorganization
     * - Loss of the memory pool
     */
    this.pendingSpace = new Space(
      space.snapshot(),
      env.ContractConfig,
      space.LastCommitId,
      space.LastHandledApiEvent,
      true, // note
      SpaceType.pending
    );

    // init
    if (!this.newestCommitData) {
      const lastCommit = (await opCommitDao.find({}, { sort: { _id: -1 } }))[0];
      if (!lastCommit) {
        const priceInfo = await this.calculateCurPriceInfo();
        const parent = space.LastCommitId;
        const gas_price = this.getAdjustedGasPrice(priceInfo.gasPrice);
        this.newestCommitData = {
          op: {
            p: "brc20-swap",
            op: OpType.commit,
            module: config.moduleId,
            parent,
            gas_price,
            data: [],
          },
          feeRate: priceInfo.feeRate,
          satsPrice: priceInfo.satsPrice,
          result: [],
          height: UNCONFIRM_HEIGHT,
        };
        if (config.swapFeeRate) {
          this.newestCommitData.op.swap_fee_rate =
            config.swapFeeRate.toString();
        }
        await this.trySave();
      } else {
        this.newestCommitData = lastCommit;
        await this.tryNewCommitOp();
      }
    }

    // update unconfirmed commit op
    const res = await this.getUnConfirmedCommitDataFrom(space.LastCommitId);

    for (let i = 0; i < res.length; i++) {
      const event: OpEvent = {
        op: res[i].op,
        inscriptionId: res[i].inscriptionId,
        height: UNCONFIRM_HEIGHT, // TOCHECK: NewestHeight
        cursor: PENDING_CURSOR,
        valid: true,
        event: EventType.commit,
        from: null,
        to: null,
        inscriptionNumber: null,
        blocktime: null,
        txid: null,
        data: null,
      };
      let result = await this.handleEvent(event, true);

      // recalculate newest result
      if (i == res.length - 1) {
        if (!config.readonly) {
          need(this.newestCommitData.op.parent == (event.op as any).parent);
          this.newestCommitData.result = result.map((item) => {
            return item.result;
          });
        }
      }
    }
  }

  async tick() {
    this.pendingSpace.tick();

    if (config.readonly) {
      return;
    }

    for (const id in this.preResMap) {
      const item = this.preResMap[id];
      if (Date.now() - item.timestamp > 300_000) {
        delete this.preResMap[id];
      }
    }

    await this.trySave();
    await this.tryCommit();
    await this.tryNewCommitOp();
  }

  private async calUSD(tick0: string, tick1: string, amount: string) {
    const price = await query.getCurTick0Price(tick0, tick1);
    return decimalCal([price, "mul", amount], PRICE_DECIMAL);
  }

  async quoteSwapNew(req: QuoteSwapReq): Promise<QuoteMultiSwapRes> {
    const { address, tickIn, tickOut, exactType } = req;
    need(multiRoutes.matchMultiRoute(tickIn, tickOut), pool_not_found);
    let ret: QuoteSwapRes;
    let tick0 = tickIn;
    let tick1 = tickOut;
    let amount: string = req.amount;
    const middleRoutesExpect: string[] = [];
    const routes = multiRoutes.getMiddlewareRoute();
    if (exactType == ExactType.exactOut) {
      for (let i = routes.length - 1; i >= 0; i--) {
        const params = {
          address,
          tickIn: routes[i],
          tickOut: tick1,
          exactType,
          amount,
        };
        ret = await this.quoteSwap(params);
        amount = ret.expect;
        tick1 = routes[i];
        middleRoutesExpect.unshift(ret.expect);
      }
      const params = {
        address,
        tickIn,
        tickOut: tick1,
        exactType,
        amount,
      };
      ret = await this.quoteSwap(params);
    } else {
      for (let i = 0; i < routes.length; i++) {
        const params = {
          address,
          tickIn: tick0,
          tickOut: routes[i],
          exactType,
          amount,
        };
        ret = await this.quoteSwap(params);
        amount = ret.expect;
        tick0 = routes[i];
        middleRoutesExpect.push(ret.expect);
      }
      const params = {
        address,
        tickIn: tick0,
        tickOut,
        exactType,
        amount,
      };
      ret = await this.quoteSwap(params);
    }
    return {
      ...ret,
      routesExpect: middleRoutesExpect,
    };
  }

  async quoteSwap(req: QuoteSwapReq): Promise<QuoteSwapRes> {
    const { tickIn, tickOut, amount, exactType } = req;
    const pair = getPairStrV2(tickIn, tickOut);
    const assets = this.PendingSpace.Assets;
    const contract = this.PendingSpace.Contract;

    // await this.mutex.waitForUnlock();

    need(bn(amount).lt(maxAmount), invalid_amount);
    need(bn(amount).gt("0"), invalid_amount);

    need(this.pendingSpace.Assets.isExist(pair), pool_not_found);

    // prevent insufficient balance error
    const decimalIn = decimal.get(tickIn);
    const decimalOut = decimal.get(tickOut);
    const poolAmountIn = assets.get(tickIn).balanceOf(pair);
    const poolAmountOut = assets.get(tickOut).balanceOf(pair);

    let expect: string;
    let amountUSD: string;
    let expectUSD: string;
    if (exactType == ExactType.exactIn) {
      need(
        bnDecimalPlacesValid(amount, decimalIn),
        getPrecisionTip(tickIn, decimalIn)
      );
      let swapFeeRate1000: string;
      if (this.newestCommitData.op.swap_fee_rate) {
        swapFeeRate1000 = (
          parseFloat(this.newestCommitData.op.swap_fee_rate) * 1000
        ).toString();
      }
      expect = contract.getAmountOut(
        {
          amountIn: bnUint(amount, decimalIn),
          reserveIn: poolAmountIn,
          reserveOut: poolAmountOut,
        },
        swapFeeRate1000
      );
      expect = bnDecimal(expect, decimalOut);
      amountUSD = await this.calUSD(tickIn, tickOut, amount);
      expectUSD = await this.calUSD(tickOut, tickIn, expect);
    } else {
      const amountOut = bnUint(amount, decimalOut);
      need(bn(amountOut).lt(poolAmountOut), insufficient_liquidity);
      let swapFeeRate1000: string;
      if (this.newestCommitData.op.swap_fee_rate) {
        swapFeeRate1000 = (
          parseFloat(this.newestCommitData.op.swap_fee_rate) * 1000
        ).toString();
      }
      expect = contract.getAmountIn(
        {
          amountOut,
          reserveIn: poolAmountIn,
          reserveOut: poolAmountOut,
        },
        swapFeeRate1000
      );
      expect = bnDecimal(expect, decimalIn);
      amountUSD = await this.calUSD(tickOut, tickIn, amount);
      expectUSD = await this.calUSD(tickIn, tickOut, expect);
    }

    return { expect, amountUSD, expectUSD };
  }

  async quoteRemoveLiq(req: QuoteRemoveLiqReq): Promise<QuoteRemoveLiqRes> {
    const { tick0, tick1, lp } = req;
    need(bn(lp).lt(maxAmount), invalid_amount);
    need(bn(lp).gt("0"), invalid_amount);
    need(bnDecimalPlacesValid(lp, LP_DECIMAL), getPrecisionTip(lp, LP_DECIMAL));

    // await this.mutex.waitForUnlock();

    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);

    const lpInt = bnUint(lp, LP_DECIMAL);
    const pair = getPairStrV2(tick0, tick1);
    const assets = this.PendingSpace.Assets;
    const poolLp = getPoolLp(this.PendingSpace, pair);
    const poolAmount0 = assets.get(tick0).balanceOf(pair);
    const poolAmount1 = assets.get(tick1).balanceOf(pair);
    let amount0 = uintCal([lpInt, "mul", poolAmount0, "div", poolLp]);
    let amount1 = uintCal([lpInt, "mul", poolAmount1, "div", poolLp]);
    amount0 = bnDecimal(amount0, decimal0);
    amount1 = bnDecimal(amount1, decimal1);

    return {
      tick0,
      tick1,
      amount0,
      amount1,
      amount0USD: await this.calUSD(tick0, tick1, amount0),
      amount1USD: await this.calUSD(tick1, tick0, amount1),
    };
  }

  async quoteAddLiq(req: QuoteAddLiqReq): Promise<QuoteAddLiqRes> {
    const { tick0, tick1, amount0: reqAmount0, amount1: reqAmount1 } = req;
    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);
    const pair = getPairStrV2(tick0, tick1);
    const assets = this.PendingSpace.Assets;

    // await this.mutex.waitForUnlock();

    if (!assets.isExist(pair) || assets.getSwapSupply(pair) == "0") {
      checkAmount(reqAmount0, decimal0);
      checkAmount(reqAmount1, decimal1);

      let lp: string;
      try {
        lp = uintCal([
          bnUint(reqAmount0, decimal0),
          "mul",
          bnUint(reqAmount1, decimal1),
          "sqrt",
          "sub",
          "1000",
        ]);
      } catch (err) {
        throw new Error(liquidity_too_low);
      }

      return {
        amount0: reqAmount0,
        amount1: reqAmount1,
        amount0USD: await this.calUSD(tick0, tick1, reqAmount0),
        amount1USD: await this.calUSD(tick1, tick0, reqAmount1),
        lp: bnDecimal(lp, LP_DECIMAL),
        tick0PerTick1: decimalCal([reqAmount0, "div", reqAmount1]),
        tick1PerTick0: decimalCal([reqAmount1, "div", reqAmount0]),
        shareOfPool: "1",
      };
    } else {
      need(!reqAmount0 || !reqAmount1);
      const poolLp = getPoolLp(this.PendingSpace, pair);
      const poolAmount0 = assets.get(tick0).balanceOf(pair);
      const poolAmount1 = assets.get(tick1).balanceOf(pair);

      let lp: string;
      let amount0Int: string;
      let amount1Int: string;
      let amount0: string;
      let amount1: string;

      if (reqAmount0) {
        need(bn(reqAmount0).lt(maxAmount), invalid_amount);
        need(bn(reqAmount0).gt("0"), invalid_amount);
        need(
          bnDecimalPlacesValid(reqAmount0, decimal0),
          getPrecisionTip(tick0, decimal0)
        );

        amount0Int = bnUint(reqAmount0, decimal0);
        amount1Int = uintCal([
          amount0Int,
          "mul",
          poolAmount1,
          "div",
          poolAmount0,
        ]);
        const lp0 = uintCal([amount0Int, "mul", poolLp, "div", poolAmount0]);
        const lp1 = uintCal([amount1Int, "mul", poolLp, "div", poolAmount1]);
        lp = bn(lp0).lt(lp1) ? lp0 : lp1;

        amount0 = reqAmount0;

        if (isProportional(amount0Int, amount1Int)) {
          // if it is exactly proportional, then do not add the minimum value of 1
          amount1 = bnDecimal(amount1Int, decimal1);
        } else {
          // preventing the final actual execution from taking the calculated value on one side, resulting in the original input integer value becoming something like 0.9999999 [1]
          amount1 = bnDecimal(uintCal([amount1Int, "add", 1]), decimal1);
        }
      } else {
        need(bn(reqAmount1).lt(maxAmount), invalid_amount);
        need(bn(reqAmount1).gt("0"), invalid_amount);
        need(
          bnDecimalPlacesValid(reqAmount1, decimal1),
          getPrecisionTip(tick1, decimal1)
        );

        amount1Int = bnUint(reqAmount1, decimal1);
        amount0Int = uintCal([
          amount1Int,
          "mul",
          poolAmount0,
          "div",
          poolAmount1,
        ]);
        const lp0 = uintCal([amount0Int, "mul", poolLp, "div", poolAmount0]);
        const lp1 = uintCal([amount1Int, "mul", poolLp, "div", poolAmount1]);
        lp = bn(lp0).lt(lp1) ? lp0 : lp1;

        // same as above [1]
        if (isProportional(amount0Int, amount1Int)) {
          // if it is exactly proportional, then do not add the minimum value of 1
          amount0 = bnDecimal(amount0Int, decimal0);
        } else {
          amount0 = bnDecimal(uintCal([amount0Int, "add", 1]), decimal0);
        }
        amount1 = reqAmount1;
      }

      lp = bnDecimal(lp, LP_DECIMAL);

      checkAmount(amount0, decimal0);
      checkAmount(amount1, decimal1);
      checkAmount(lp, LP_DECIMAL);

      return {
        amount0,
        amount1,
        amount0USD: await this.calUSD(tick0, tick1, amount0),
        amount1USD: await this.calUSD(tick1, tick0, amount1),
        lp,
        tick0PerTick1: decimalCal([amount0, "div", amount1], decimal0),
        tick1PerTick0: decimalCal([amount1, "div", amount0], decimal1),
        shareOfPool: decimalCal([
          lp,
          "div",
          decimalCal([bnDecimal(poolLp, LP_DECIMAL), "add", lp]),
        ]),
      };
    }
  }

  async calculateCurPriceInfo(): Promise<{
    gasPrice: string;
    feeRate: string;
    satsPrice: string;
  }> {
    if (config.fixedGasPrice) {
      return {
        gasPrice: config.fixedGasPrice,
        feeRate: "",
        satsPrice: "",
      };
    }

    let satsPrice = await getSatsPrice();

    const res2 = await opCommitDao.find({}, { sort: { _id: -1 }, limit: 2 });

    // limit price
    if (res2.length > 1 && res2[1].satsPrice) {
      let item = res2[1];
      let max = decimalCal([item.satsPrice, "mul", "1.5"]);
      let min = decimalCal([item.satsPrice, "mul", "0.5"]);
      if (bn(satsPrice).gt(max)) {
        satsPrice = max;
      }
      if (bn(satsPrice).lt(min)) {
        satsPrice = min;
      }
    }

    const feeRate = Math.max(config.minFeeRate, env.FeeRate * 2).toString();
    const gasPrice = decimalCal(
      [feeRate, "div", satsPrice, "div", 4, "mul", config.commitFeeRateRatio], // 120% feeRate
      decimal.get(env.ModuleInitParams.gas_tick)
    );

    return { gasPrice, feeRate, satsPrice };
  }

  async getFreeQuota(
    address: string,
    tick: string
  ): Promise<{
    totalFreeQuota: string;
    remainingFreeQuota: string;
    totalUsedFreeQuota: string;
    hasVoucher: boolean;
  }> {
    const res = await api.freeQuotaSummary(address);
    let remaining = decimalCal([res.totalQuota, "sub", res.usedQuota]);
    return {
      totalFreeQuota: res?.totalQuota || "0",
      remainingFreeQuota: remaining,
      totalUsedFreeQuota: res?.usedQuota || "0",
      hasVoucher: res?.hasVoucher || false,
    };
  }

  async genPreRes(
    req: FuncReq,
    appendCostUsd?: number,
    disableVoucher?: boolean
  ): Promise<PreRes> {
    need(!!req.req.feeTick, paramsMissing("feeTick"));
    req.req.feeTickPrice = (
      await api.coinmarketcapPriceInfo(req.req.feeTick)
    ).price.toString();

    let assetFeeTick;
    if (req.func == FuncType.swap) {
      assetFeeTick = req.req.assetFeeTick ?? req.req.tickIn;
    } else if (req.func == FuncType.send) {
      assetFeeTick = req.req.tick;
    }

    const feeRes = estimateServerFee(req, appendCostUsd);
    const sFbFeeReq = _.cloneDeep(req);
    sFbFeeReq.req.feeTick = DEFAULT_GAS_TICK;
    sFbFeeReq.req.feeTickPrice = (
      await api.coinmarketcapPriceInfo(DEFAULT_GAS_TICK)
    ).price.toString();
    const sFbRes = estimateServerFee(sFbFeeReq, appendCostUsd);

    let totalFreeQuota = "0";
    let remainingFreeQuota = "0";
    let totalUsedFreeQuota = "0";
    let hasVoucher = false;
    if (config.unisatGlobalApi) {
      // All tickers support the conversion to equivalent value of freeQuota.
      const freeQuotaRes = await this.getFreeQuota(
        req.req.address,
        DEFAULT_GAS_TICK
      );
      totalFreeQuota = freeQuotaRes.totalFreeQuota;
      remainingFreeQuota = freeQuotaRes.remainingFreeQuota;
      totalUsedFreeQuota = freeQuotaRes.totalUsedFreeQuota;
      hasVoucher = freeQuotaRes.hasVoucher;
      if (disableVoucher) {
        hasVoucher = false;
      }
      if (hasVoucher) {
        req.req.payType = PayType.freeQuota;
      }
    }
    const usageFreeQuota = sFbRes.feeAmount;

    let realFeeAmount = feeRes.feeAmount;
    let originalFeeAmount = feeRes.feeAmount;
    try {
      // select freeQuota Pay Type: tick, freeQuota
      if (req.req.payType == PayType.freeQuota) {
        if (
          parseFloat(decimalCal([remainingFreeQuota, "sub", usageFreeQuota])) >
          0
        ) {
          realFeeAmount = "0";
        }
      }
    } catch (err) {}
    if (isFreeFeeAddr(req.req.address)) {
      realFeeAmount = "0";
      originalFeeAmount = "0";
    }

    let assetFeeAmount: string;
    let assetFeeTickPrice: string;
    let assetFeeTickBalance: string;
    if (assetFeeTick) {
      try {
        const swapTickReq = _.cloneDeep(req);
        swapTickReq.req.feeTick = assetFeeTick;
        swapTickReq.req.feeTickPrice = (
          await query.getTickPrice(assetFeeTick)
        ).toString();
        const swapTickRes = estimateServerFee(swapTickReq, undefined, true);
        assetFeeAmount = swapTickRes.feeAmount;
        assetFeeTickPrice = swapTickReq.req.feeTickPrice;
        assetFeeTickBalance = swapTickRes.feeBalance;
      } catch (err) {
        assetFeeTick = undefined;
        assetFeeAmount = undefined;
        assetFeeTickPrice = undefined;
        assetFeeTickBalance = undefined;
      }
    }

    req.req.feeAmount = realFeeAmount;
    (req.req as any).assetFeeAmount = assetFeeAmount;
    (req.req as any).assetFeeTickPrice = assetFeeTickPrice;
    (req.req as any).assetFeeTick = assetFeeTick;

    const res1 = operator.__getSignMsg(req);

    const ret: PreRes = {
      ids: res1.map((item) => {
        return item.id;
      }),
      signMsgs: res1.map((item) => {
        return item.signMsg;
      }),
      feeAmount: originalFeeAmount,
      feeTick: req.req.feeTick,
      feeTickPrice: req.req.feeTickPrice,
      feeBalance: feeRes.feeBalance,
      totalFreeQuota,
      remainingFreeQuota,
      totalUsedFreeQuota,
      usageFreeQuota,
      usdPrice: feeRes.usdPrice,
      hasVoucher,
      assetFeeTick: assetFeeTick,
      assetFeeAmount: assetFeeAmount,
      assetFeeTickPrice: assetFeeTickPrice,
      assetFeeTickBalance: assetFeeTickBalance,
    };

    if (ret.ids[0]) {
      this.preResMap[ret.ids[0]] = { res: ret, timestamp: Date.now() };
    } else {
      // empty opt and free fee
      if (req.func == FuncType.claim) {
        const id = hash({
          pid: req.req.pid,
          address: req.req.address,
          feeTick: req.req.feeTick,
          ts: req.req.ts,
        });
        this.preResMap[id] = { res: ret, timestamp: Date.now() };
      }
    }

    return ret;
  }

  async multiGenPreRes(params: SwapReq): Promise<PreRes[]> {
    const { address, tickIn, tickOut, amountIn, amountOut, exactType } = params;
    need(multiRoutes.matchMultiRoute(tickIn, tickOut), pool_not_found);
    const quoteRet = await this.quoteSwapNew({
      address,
      tickIn,
      tickOut,
      exactType,
      amount: exactType == ExactType.exactIn ? amountIn : amountOut,
    });
    const routesExpect = quoteRet.routesExpect;
    need(routesExpect.length == 1);

    const req = {
      func: FuncType.swap,
      req: params,
    } as FuncReq;
    need(!!req.req.feeTick, paramsMissing("feeTick"));
    req.req.feeTickPrice = (
      await api.coinmarketcapPriceInfo(req.req.feeTick)
    ).price.toString();

    let assetFeeTick = (req as any).req.tickIn;

    const feeRes = estimateServerFee(req);
    const sFbFeeReq = _.cloneDeep(req);
    sFbFeeReq.req.feeTick = DEFAULT_GAS_TICK;
    sFbFeeReq.req.feeTickPrice = (
      await api.coinmarketcapPriceInfo(DEFAULT_GAS_TICK)
    ).price.toString();
    const sFbRes = estimateServerFee(sFbFeeReq);

    let totalFreeQuota = "0";
    let remainingFreeQuota = "0";
    let totalUsedFreeQuota = "0";
    let hasVoucher = false;
    if (config.unisatGlobalApi) {
      // All tickers support the conversion to equivalent value of freeQuota.
      const freeQuotaRes = await this.getFreeQuota(
        req.req.address,
        DEFAULT_GAS_TICK
      );
      totalFreeQuota = freeQuotaRes.totalFreeQuota;
      remainingFreeQuota = freeQuotaRes.remainingFreeQuota;
      totalUsedFreeQuota = freeQuotaRes.totalUsedFreeQuota;
      hasVoucher = freeQuotaRes.hasVoucher;
      if (hasVoucher) {
        req.req.payType = PayType.freeQuota;
      }
    }
    const usageFreeQuota = sFbRes.feeAmount;

    let realFeeAmount = feeRes.feeAmount;
    let originalFeeAmount = feeRes.feeAmount;
    try {
      // select freeQuota Pay Type: tick, freeQuota
      if (req.req.payType == PayType.freeQuota) {
        if (
          parseFloat(decimalCal([remainingFreeQuota, "sub", usageFreeQuota])) >
          0
        ) {
          realFeeAmount = "0";
        }
      }
    } catch (err) {}
    if (isFreeFeeAddr(req.req.address)) {
      realFeeAmount = "0";
      originalFeeAmount = "0";
    }

    let assetFeeAmount: string;
    let assetFeeTickPrice: string;
    let assetFeeTickBalance: string;
    if (assetFeeTick) {
      try {
        const swapTickReq = _.cloneDeep(req);
        swapTickReq.req.feeTick = assetFeeTick;
        swapTickReq.req.feeTickPrice = (
          await query.getTickPrice(assetFeeTick)
        ).toString();
        const swapTickRes = estimateServerFee(swapTickReq, undefined, true);
        assetFeeAmount = swapTickRes.feeAmount;
        assetFeeTickPrice = swapTickReq.req.feeTickPrice;
        assetFeeTickBalance = swapTickRes.feeBalance;
      } catch (err) {
        assetFeeTick = undefined;
        assetFeeAmount = undefined;
        assetFeeTickPrice = undefined;
        assetFeeTickBalance = undefined;
      }
    }

    req.req.feeAmount = realFeeAmount;
    (req.req as any).assetFeeAmount = assetFeeAmount;
    (req.req as any).assetFeeTickPrice = assetFeeTickPrice;
    (req.req as any).assetFeeTick = assetFeeTick;
    const reqs = [
      {
        func: FuncType.swap,
        req: {
          ...params,
          tickOut: multiRoutes.getMiddlewareRoute()[0],
          amountOut: routesExpect[0],
        },
      },
      {
        func: FuncType.swap,
        req: {
          ...params,
          assetFeeTick: tickIn,
          tickIn: multiRoutes.getMiddlewareRoute()[0],
          amountIn: routesExpect[0],
        },
      },
    ] as FuncReq[];
    const res = await this.__getBatchSignMsg2(reqs);
    const rets: PreRes[] = [];

    const ret0: PreRes = {
      ids: res[0].map((item) => {
        return item.id;
      }),
      signMsgs: res[0].map((item) => {
        return item.signMsg;
      }),
      feeAmount: originalFeeAmount,
      feeTick: req.req.feeTick,
      feeTickPrice: req.req.feeTickPrice,
      feeBalance: feeRes.feeBalance,
      totalFreeQuota,
      remainingFreeQuota,
      totalUsedFreeQuota,
      usageFreeQuota,
      usdPrice: feeRes.usdPrice,
      hasVoucher,
      assetFeeTick: assetFeeTick,
      assetFeeAmount: assetFeeAmount,
      assetFeeTickPrice: assetFeeTickPrice,
      assetFeeTickBalance: assetFeeTickBalance,
    };

    if (ret0.ids[0]) {
      this.preResMap[ret0.ids[0]] = { res: ret0, timestamp: Date.now() };
    } else {
      // empty opt and free fee
      if (req.func == FuncType.claim) {
        const id = hash({
          pid: req.req.pid,
          address: req.req.address,
          feeTick: req.req.feeTick,
          ts: req.req.ts,
        });
        this.preResMap[id] = { res: ret0, timestamp: Date.now() };
      }
    }
    rets.push(ret0);

    const ret1: PreRes = {
      ids: res[1].map((item) => {
        return item.id;
      }),
      signMsgs: res[1].map((item) => {
        return item.signMsg;
      }),
      feeAmount: originalFeeAmount,
      feeTick: req.req.feeTick,
      feeTickPrice: req.req.feeTickPrice,
      feeBalance: feeRes.feeBalance,
      totalFreeQuota,
      remainingFreeQuota,
      totalUsedFreeQuota,
      usageFreeQuota,
      usdPrice: feeRes.usdPrice,
      hasVoucher,
      assetFeeTick: assetFeeTick,
      assetFeeAmount: assetFeeAmount,
      assetFeeTickPrice: assetFeeTickPrice,
      assetFeeTickBalance: assetFeeTickBalance,
    };

    if (ret1.ids[0]) {
      this.preResMap[ret1.ids[0]] = { res: ret1, timestamp: Date.now() };
    } else {
      // empty opt and free fee
      if (req.func == FuncType.claim) {
        const id = hash({
          pid: req.req.pid,
          address: req.req.address,
          feeTick: req.req.feeTick,
          ts: req.req.ts,
        });
        this.preResMap[id] = { res: ret1, timestamp: Date.now() };
      }
    }
    rets.push(ret1);

    return rets;
  }

  async genBatchPreRes(
    req: BatchFuncReq,
    appendCostUsd?: number,
    disableVoucher?: boolean
  ): Promise<PreRes> {
    need(!!req.req.feeTick, paramsMissing("feeTick"));
    req.req.feeTickPrice = (
      await api.coinmarketcapPriceInfo(req.req.feeTick)
    ).price.toString();

    const feeRes = estimateBatchServerFee(req, appendCostUsd);
    const sFbFeeReq = _.cloneDeep(req);
    sFbFeeReq.req.feeTick = DEFAULT_GAS_TICK;
    sFbFeeReq.req.feeTickPrice = (
      await api.coinmarketcapPriceInfo(DEFAULT_GAS_TICK)
    ).price.toString();
    const sFbRes = estimateBatchServerFee(sFbFeeReq, appendCostUsd);

    let totalFreeQuota = "0";
    let remainingFreeQuota = "0";
    let totalUsedFreeQuota = "0";
    let hasVoucher = false;
    if (config.unisatGlobalApi) {
      // All tickers support the conversion to equivalent value of freeQuota.
      const freeQuotaRes = await this.getFreeQuota(
        req.req.address,
        DEFAULT_GAS_TICK
      );
      totalFreeQuota = freeQuotaRes.totalFreeQuota;
      remainingFreeQuota = freeQuotaRes.remainingFreeQuota;
      totalUsedFreeQuota = freeQuotaRes.totalUsedFreeQuota;
      hasVoucher = freeQuotaRes.hasVoucher;
      if (disableVoucher) {
        hasVoucher = false;
      }
      if (hasVoucher) {
        req.req.payType = PayType.freeQuota;
      }
    }
    const usageFreeQuota = sFbRes.feeAmount;

    let realFeeAmount = feeRes.feeAmount;
    let originalFeeAmount = feeRes.feeAmount;
    try {
      // select freeQuota Pay Type: tick, freeQuota
      if (req.req.payType == PayType.freeQuota) {
        if (
          parseFloat(decimalCal([remainingFreeQuota, "sub", usageFreeQuota])) >
          0
        ) {
          realFeeAmount = "0";
        }
      }
    } catch (err) {}
    if (isFreeFeeAddr(req.req.address)) {
      realFeeAmount = "0";
      originalFeeAmount = "0";
    }

    req.req.feeAmount = realFeeAmount;

    const reqs = batchReqToReqs(req);
    const res1 = operator.__getBatchSignMsg(reqs);

    const ret: PreRes = {
      ids: res1.map((item) => {
        return item.id;
      }),
      signMsgs: res1.map((item) => {
        return item.signMsg;
      }),
      feeAmount: originalFeeAmount,
      feeTick: req.req.feeTick,
      feeTickPrice: req.req.feeTickPrice,
      feeBalance: feeRes.feeBalance,
      totalFreeQuota,
      remainingFreeQuota,
      totalUsedFreeQuota,
      usageFreeQuota,
      usdPrice: feeRes.usdPrice,
      hasVoucher,
    };

    this.preResMap[ret.ids[0]] = { res: ret, timestamp: Date.now() };

    return ret;
  }

  private __getSignMsg(req: FuncReq): SignMsgRes {
    const address = req.req.address;
    const op = this.newestCommitData.op;
    checkAddressType(address);
    this.checkSystemStatus();
    const res: OridinalMsg[] = [];
    for (let i = 0; i < this.newestCommitData.op.data.length; i++) {
      const item = this.newestCommitData.op.data[i];
      if (item.addr == address) {
        res.push({
          module: this.newestCommitData.op.module,
          parent: this.newestCommitData.op.parent,
          gas_price: this.newestCommitData.op.gas_price,
          addr: item.addr,
          func: item.func,
          params: item.params,
          ts: item.ts,
        });
      }
    }

    let ret: SignMsgRes;
    let opt: any;
    if (req.func == FuncType.claim) {
      ret = [];
    } else {
      opt = {
        module: op.module,
        parent: op.parent,
        gas_price: op.gas_price,
        addr: address,
        ...convertReq2Arr(req),
        ts: req.req.ts,
      };
      const optRes = getSignMsg(res.concat(opt));

      need(!!req.req.feeTick, "Fee tick error");
      need(parseFloat(req.req.feeAmount) >= 0, "Fee amount error");

      ret = [
        {
          id: optRes.id,
          prevs: optRes.prevs,
          signMsg: optRes.signMsg,
        },
      ];
    }
    if (req.req.payType == PayType.tick && parseFloat(req.req.feeAmount) > 0) {
      const fee = {
        module: op.module,
        parent: op.parent,
        gas_price: op.gas_price,
        addr: address,
        ...convertReq2Arr({
          func: FuncType.send,
          req: {
            ...req.req,
            to: env.ModuleInitParams.gas_to,
            tick: req.req.feeTick,
            amount: req.req.feeAmount,
          },
        }),
        ts: req.req.ts,
      };

      if (opt) {
        need(opt.addr == fee.addr);
        const feeRes = getSignMsg(res.concat([opt, fee]));
        ret.push({
          id: feeRes.id,
          prevs: feeRes.prevs,
          signMsg: feeRes.signMsg,
        });
      } else {
        const feeRes = getSignMsg(res.concat([fee]));
        ret.push({
          id: feeRes.id,
          prevs: feeRes.prevs,
          signMsg: feeRes.signMsg,
        });
      }
    } else if (
      req.req.payType == PayType.assetFeeTick &&
      parseFloat((req.req as any).assetFeeAmount) > 0
    ) {
      const fee = {
        module: op.module,
        parent: op.parent,
        gas_price: op.gas_price,
        addr: address,
        ...convertReq2Arr({
          func: FuncType.send,
          req: {
            ...req.req,
            to: env.ModuleInitParams.gas_to,
            tick: (req.req as any).assetFeeTick,
            amount: (req.req as any).assetFeeAmount,
          },
        }),
        ts: req.req.ts,
      };

      if (opt) {
        need(opt.addr == fee.addr);
        const feeRes = getSignMsg(res.concat([opt, fee]));
        ret.push({
          id: feeRes.id,
          prevs: feeRes.prevs,
          signMsg: feeRes.signMsg,
        });
      } else {
        const feeRes = getSignMsg(res.concat([fee]));
        ret.push({
          id: feeRes.id,
          prevs: feeRes.prevs,
          signMsg: feeRes.signMsg,
        });
      }
    }

    return ret;
  }

  private __getBatchSignMsg(reqs: FuncReq[]): SignMsgRes {
    const address = reqs[0].req.address;
    for (let i = 1; i < reqs.length; i++) {
      need(
        reqs[i].req.address == address,
        "Addresses must match for batch signing"
      );
    }

    const op = this.newestCommitData.op;
    checkAddressType(address);
    this.checkSystemStatus();
    const res: OridinalMsg[] = [];
    for (let i = 0; i < this.newestCommitData.op.data.length; i++) {
      const item = this.newestCommitData.op.data[i];
      if (item.addr == address) {
        res.push({
          module: this.newestCommitData.op.module,
          parent: this.newestCommitData.op.parent,
          gas_price: this.newestCommitData.op.gas_price,
          addr: item.addr,
          func: item.func,
          params: item.params,
          ts: item.ts,
        });
      }
    }

    let ret: SignMsgRes = [];
    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];
      let opt: any;
      if (req.func == FuncType.claim) {
        // ret = [];
      } else {
        opt = {
          module: op.module,
          parent: op.parent,
          gas_price: op.gas_price,
          addr: address,
          ...convertReq2Arr(req),
          ts: req.req.ts,
        };
        const optRes = getSignMsg(res.concat(opt));

        need(!!req.req.feeTick, "Fee tick error");
        need(parseFloat(req.req.feeAmount) >= 0, "Fee amount error");

        ret.push({
          id: optRes.id,
          prevs: optRes.prevs,
          signMsg: optRes.signMsg,
        });
      }

      let fee: any;
      if (
        req.req.payType == PayType.tick &&
        parseFloat(req.req.feeAmount) > 0
      ) {
        fee = {
          module: op.module,
          parent: op.parent,
          gas_price: op.gas_price,
          addr: address,
          ...convertReq2Arr({
            func: FuncType.send,
            req: {
              ...req.req,
              to: env.ModuleInitParams.gas_to,
              tick: req.req.feeTick,
              amount: req.req.feeAmount,
            },
          }),
          ts: req.req.ts,
        };

        if (opt) {
          need(opt.addr == fee.addr);
          const feeRes = getSignMsg(res.concat([opt, fee]));
          ret.push({
            id: feeRes.id,
            prevs: feeRes.prevs,
            signMsg: feeRes.signMsg,
          });
        } else {
          const feeRes = getSignMsg(res.concat([fee]));
          ret.push({
            id: feeRes.id,
            prevs: feeRes.prevs,
            signMsg: feeRes.signMsg,
          });
        }
      }

      if (opt) {
        res.push(opt);
      }
      if (fee) {
        res.push(fee);
      }
    }

    return ret;
  }

  private __getBatchSignMsg2(reqs: FuncReq[]): SignMsgRes[] {
    const address = reqs[0].req.address;
    for (let i = 1; i < reqs.length; i++) {
      need(
        reqs[i].req.address == address,
        "Addresses must match for batch signing"
      );
    }

    const op = this.newestCommitData.op;
    checkAddressType(address);
    this.checkSystemStatus();
    const res: OridinalMsg[] = [];
    for (let i = 0; i < this.newestCommitData.op.data.length; i++) {
      const item = this.newestCommitData.op.data[i];
      if (item.addr == address) {
        res.push({
          module: this.newestCommitData.op.module,
          parent: this.newestCommitData.op.parent,
          gas_price: this.newestCommitData.op.gas_price,
          addr: item.addr,
          func: item.func,
          params: item.params,
          ts: item.ts,
        });
      }
    }

    let ret: SignMsgRes[] = [];
    for (let i = 0; i < reqs.length; i++) {
      const ret1: SignMsgRes = [];
      const req = reqs[i];
      let opt: any;
      if (req.func == FuncType.claim) {
        // ret = [];
      } else {
        opt = {
          module: op.module,
          parent: op.parent,
          gas_price: op.gas_price,
          addr: address,
          ...convertReq2Arr(req),
          ts: req.req.ts,
        };
        const optRes = getSignMsg(res.concat(opt));

        need(!!req.req.feeTick, "Fee tick error");
        need(parseFloat(req.req.feeAmount) >= 0, "Fee amount error");

        ret1.push({
          id: optRes.id,
          prevs: optRes.prevs,
          signMsg: optRes.signMsg,
        });
      }

      let fee: any;
      if (
        req.req.payType == PayType.tick &&
        parseFloat(req.req.feeAmount) > 0
      ) {
        fee = {
          module: op.module,
          parent: op.parent,
          gas_price: op.gas_price,
          addr: address,
          ...convertReq2Arr({
            func: FuncType.send,
            req: {
              ...req.req,
              to: env.ModuleInitParams.gas_to,
              tick: req.req.feeTick,
              amount: req.req.feeAmount,
            },
          }),
          ts: req.req.ts,
        };

        if (opt) {
          need(opt.addr == fee.addr);
          const feeRes = getSignMsg(res.concat([opt, fee]));
          ret1.push({
            id: feeRes.id,
            prevs: feeRes.prevs,
            signMsg: feeRes.signMsg,
          });
        } else {
          const feeRes = getSignMsg(res.concat([fee]));
          ret1.push({
            id: feeRes.id,
            prevs: feeRes.prevs,
            signMsg: feeRes.signMsg,
          });
        }
      } else if (
        req.req.payType == PayType.assetFeeTick &&
        parseFloat((req.req as any).assetFeeAmount) > 0
      ) {
        fee = {
          module: op.module,
          parent: op.parent,
          gas_price: op.gas_price,
          addr: address,
          ...convertReq2Arr({
            func: FuncType.send,
            req: {
              ...req.req,
              to: env.ModuleInitParams.gas_to,
              tick: (req.req as any).assetFeeTick,
              amount: (req.req as any).assetFeeAmount,
            },
          }),
          ts: req.req.ts,
        };

        if (opt) {
          need(opt.addr == fee.addr);
          const feeRes = getSignMsg(res.concat([opt, fee]));
          ret1.push({
            id: feeRes.id,
            prevs: feeRes.prevs,
            signMsg: feeRes.signMsg,
          });
        } else {
          const feeRes = getSignMsg(res.concat([fee]));
          ret1.push({
            id: feeRes.id,
            prevs: feeRes.prevs,
            signMsg: feeRes.signMsg,
          });
        }
      }
      ret.push(ret1);
      if (opt) {
        res.push(opt);
      }
      if (fee) {
        res.push(fee);
      }
    }

    return ret;
  }

  checkSystemStatus() {
    need(
      !this.reachCommitCondition(),
      system_commit_in_progress_1,
      CodeEnum.commiting
    );
    need(!sender.Committing, system_commit_in_progress_2, CodeEnum.commiting);
    need(
      !this.newestCommitData.inscriptionId,
      system_commit_in_progress_2,
      CodeEnum.commiting
    );
    need(
      !builder.IsResetPendingSpace,
      system_recovery_in_progress,
      CodeEnum.system_recovery_in_progress
    );
    need(!fatal, system_fatal_error, CodeEnum.fatal_error);
  }

  private /** @note must sync */ __aggregate(req: FuncReq, test = false) {
    // check sign
    const res = this.__getSignMsg(req);
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      need(
        isSignVerify(req.req.address, item.signMsg, req.req.sigs[i]),
        sign_fail,
        CodeEnum.signature_fail
      );
    }

    const item = this.preResMap[res[0].id];
    need(!!item, expired_data);
    need(item.res.feeAmount == req.req.feeAmount, paramsMissing("feeAmount"));
    need(item.res.feeTick == req.req.feeTick, paramsMissing("feeTick"));
    need(
      item.res.feeTickPrice == req.req.feeTickPrice,
      paramsMissing("feeTickPrice")
    );
    need(item.res.signMsgs.length == req.req.sigs.length, params_error);

    let tick: string;
    let addresses: string[] = [req.req.address];
    if (req.func == FuncType.decreaseApproval) {
      tick = req.req.tick;
    } else if (req.func == FuncType.swap) {
      tick = getPairStrV2(req.req.tickIn, req.req.tickOut);
    } else if (req.func == FuncType.send || req.func == FuncType.sendLp) {
      tick = req.req.tick;
      addresses.push(req.req.to);
    } else if (req.func == FuncType.claim) {
      // empty opt
    } else {
      tick = getPairStrV2(req.req.tick0, req.req.tick1);
    }
    const ticks = [];
    if (tick) {
      ticks.push(tick);
    }
    if (tick !== req.req.feeTick) {
      ticks.push(req.req.feeTick);
    }
    // bc1pAzerty: multi_swap
    if (
      req.req.payType == PayType.assetFeeTick &&
      (req.req as any).assetFeeTick &&
      (req.req as any).assetFeeTick !== req.req.feeTick &&
      (req.req as any).assetFeeTick !== tick
    ) {
      ticks.push((req.req as any).assetFeeTick);
    }
    const tmpPendingSpace = this.pendingSpace.partialClone(addresses, ticks);

    const gasPrice = operator.NewestCommitData.op.gas_price;

    let optFunc: InternalFunc;
    let optRes: ContractResult;
    if (req.func == FuncType.claim) {
      //
    } else {
      optFunc = {
        id: res[0].id,
        ...convertReq2Map(req),
        prevs: res[0].prevs,
        ts: req.req.ts,
        sig: req.req.sigs[0],
      };

      // check exception
      optRes = tmpPendingSpace.aggregate({
        func: optFunc,
        gasPrice,
        height: env.BestHeight,
        swapFeeRate: this.newestCommitData.op.swap_fee_rate,
      });
    }

    const feeAmount = parseFloat(req.req.feeAmount);
    const swapAmount = parseFloat((req.req as any).assetFeeAmount || "0");
    let feeFunc: InternalFunc;
    let feeRes: ContractResult;
    if (req.req.payType == PayType.tick && feeAmount > 0) {
      let feeIndex = 1;
      if (req.func == FuncType.claim) {
        feeIndex = 0;
      }

      feeFunc = {
        id: res[feeIndex].id,
        ...convertReq2Map({
          func: FuncType.send,
          req: {
            ...req.req,
            to: env.ModuleInitParams.gas_to,
            amount: req.req.feeAmount,
            tick: req.req.feeTick,
          },
        }),
        prevs: res[feeIndex].prevs,
        ts: req.req.ts,
        sig: req.req.sigs[feeIndex],
      };

      feeRes = tmpPendingSpace.aggregate({
        func: feeFunc,
        gasPrice,
        height: env.BestHeight,
        swapFeeRate: this.newestCommitData.op.swap_fee_rate,
      });
    } else if (req.req.payType == PayType.assetFeeTick && swapAmount > 0) {
      let feeIndex = 1;
      if (req.func == FuncType.claim) {
        feeIndex = 0;
      }

      feeFunc = {
        id: res[feeIndex].id,
        ...convertReq2Map({
          func: FuncType.send,
          req: {
            ...req.req,
            to: env.ModuleInitParams.gas_to,
            amount: (req.req as any).assetFeeAmount,
            tick: (req.req as any).assetFeeTick,
          },
        }),
        prevs: res[feeIndex].prevs,
        ts: req.req.ts,
        sig: req.req.sigs[feeIndex],
      };

      feeRes = tmpPendingSpace.aggregate({
        func: feeFunc,
        gasPrice,
        height: env.BestHeight,
        swapFeeRate: this.newestCommitData.op.swap_fee_rate,
      });
    }

    if (test) {
      return { optFunc, feeFunc, optRes, feeRes, tmpPendingSpace };
    }

    if (optFunc) {
      this.pendingSpace.aggregate({
        func: optFunc,
        gasPrice,
        height: env.BestHeight,
        swapFeeRate: this.newestCommitData.op.swap_fee_rate,
      });

      // opt
      this.newestCommitData.op.data.push(
        convertFuncInternal2Inscription(optFunc, env.BestHeight)
      );
      this.newestCommitData.result.push(optRes.result);
      if (this.newestCommitData.op.data.length == 1) {
        this.firstAggregateTimestamp = Date.now();
      }
    }

    // fee
    if (
      (req.req.payType == PayType.tick ||
        req.req.payType == PayType.assetFeeTick) &&
      feeAmount > 0
    ) {
      this.pendingSpace.aggregate({
        func: feeFunc,
        gasPrice,
        height: env.BestHeight,
        swapFeeRate: this.newestCommitData.op.swap_fee_rate,
      });
      this.newestCommitData.op.data.push(
        convertFuncInternal2Inscription(feeFunc, env.BestHeight)
      );
      this.newestCommitData.result.push(feeRes.result);
    }

    this.lastAggregateTimestamp = Date.now();

    // Collect addresses for balance update
    try {
      if (global.addressBalanceWorker) {
        addresses.forEach((address) => {
          global.addressBalanceWorker.collectAddress(address);
        });
      }
    } catch (error) {
      // Log error but don't fail the operation
      console.warn("Failed to collect addresses for balance update:", error);
    }

    return { optFunc, feeFunc, optRes, feeRes, tmpPendingSpace };
  }

  private /** @note must sync */ __batchAggregate(
    req: BatchFuncReq,
    test = false
  ) {
    // check sign
    const reqs = batchReqToReqs(req);
    const res = this.__getBatchSignMsg(reqs);
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      need(
        isSignVerify(req.req.address, item.signMsg, req.req.sigs[i]),
        sign_fail,
        CodeEnum.signature_fail
      );
    }

    const item = this.preResMap[res[0].id];
    need(!!item, expired_data);
    need(item.res.feeAmount == req.req.feeAmount, paramsMissing("feeAmount"));
    need(item.res.feeTick == req.req.feeTick, paramsMissing("feeTick"));
    need(
      item.res.feeTickPrice == req.req.feeTickPrice,
      paramsMissing("feeTickPrice")
    );
    need(item.res.signMsgs.length == req.req.sigs.length, params_error);

    let tick: string;
    let addresses: string[] = [req.req.address];
    const ticks = [];
    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];
      if (req.func == FuncType.decreaseApproval) {
        tick = req.req.tick;
      } else if (req.func == FuncType.swap) {
        tick = getPairStrV2(req.req.tickIn, req.req.tickOut);
      } else if (req.func == FuncType.send || req.func == FuncType.sendLp) {
        tick = req.req.tick;
        addresses.push(req.req.to);
      } else if (req.func == FuncType.claim) {
        // empty opt
      } else {
        tick = getPairStrV2(req.req.tick0, req.req.tick1);
      }

      if (tick) {
        ticks.push(tick);
      }
      if (tick !== req.req.feeTick) {
        ticks.push(req.req.feeTick);
      }
    }

    const tmpPendingSpace = this.pendingSpace.partialClone(addresses, ticks);

    const gasPrice = operator.NewestCommitData.op.gas_price;

    let optFuncs: InternalFunc[] = [];
    let optReses: ContractResult[] = [];
    let feeFuncs: InternalFunc[] = [];
    let feeReses: ContractResult[] = [];

    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];

      if (req.func == FuncType.claim) {
        optFuncs.push(null);
        optReses.push(null);
      } else {
        const optFunc = {
          id: res[i].id,
          ...convertReq2Map(req),
          prevs: res[i].prevs,
          ts: req.req.ts,
          sig: req.req.sigs[i],
        };

        // check exception
        const optRes = tmpPendingSpace.aggregate({
          func: optFunc,
          gasPrice,
          height: env.BestHeight,
          swapFeeRate: this.newestCommitData.op.swap_fee_rate,
        });
        optFuncs.push(optFunc);
        optReses.push(optRes);
      }

      const feeAmount = parseFloat(req.req.feeAmount);
      if (req.req.payType == PayType.tick && feeAmount > 0) {
        need(i == reqs.length - 1, "Only the last request can pay fee");
        const feeIndex = res.length - 1;
        const feeFunc = {
          id: res[feeIndex].id,
          ...convertReq2Map({
            func: FuncType.send,
            req: {
              ...req.req,
              to: env.ModuleInitParams.gas_to,
              amount: req.req.feeAmount,
              tick: req.req.feeTick,
            },
          }),
          prevs: res[feeIndex].prevs,
          ts: req.req.ts,
          sig: req.req.sigs[feeIndex],
        };

        const feeRes = tmpPendingSpace.aggregate({
          func: feeFunc,
          gasPrice,
          height: env.BestHeight,
          swapFeeRate: this.newestCommitData.op.swap_fee_rate,
        });
        feeFuncs.push(feeFunc);
        feeReses.push(feeRes);
      } else {
        feeFuncs.push(null);
        feeReses.push(null);
      }
    }

    if (test) {
      return { optFuncs, feeFuncs, optReses, feeReses, tmpPendingSpace };
    }

    for (let i = 0; i < optFuncs.length; i++) {
      const optFunc = optFuncs[i];
      const optRes = optReses[i];

      if (optFunc) {
        this.pendingSpace.aggregate({
          func: optFunc,
          gasPrice,
          height: env.BestHeight,
          swapFeeRate: this.newestCommitData.op.swap_fee_rate,
        });

        // opt
        this.newestCommitData.op.data.push(
          convertFuncInternal2Inscription(optFunc, env.BestHeight)
        );
        this.newestCommitData.result.push(optRes.result);
        if (this.newestCommitData.op.data.length == 1) {
          this.firstAggregateTimestamp = Date.now();
        }
      }
    }

    // fee
    for (let i = 0; i < feeFuncs.length; i++) {
      const feeFunc = feeFuncs[i];
      const feeRes = feeReses[i];
      const feeAmount = parseFloat(reqs[i].req.feeAmount);
      if (req.req.payType == PayType.tick && feeAmount > 0) {
        need(!!feeFunc);
        need(!!feeRes);
        this.pendingSpace.aggregate({
          func: feeFunc,
          gasPrice,
          height: env.BestHeight,
          swapFeeRate: this.newestCommitData.op.swap_fee_rate,
        });
        this.newestCommitData.op.data.push(
          convertFuncInternal2Inscription(feeFunc, env.BestHeight)
        );
        this.newestCommitData.result.push(feeRes.result);
      }
    }

    this.lastAggregateTimestamp = Date.now();
    return { optFuncs, feeFuncs, optReses, feeReses, tmpPendingSpace };
  }

  async batchVerify(req: BatchFuncReq) {
    const { optFuncs, optReses, feeFuncs, feeReses } = this.__batchAggregate(
      req,
      true
    );

    if (optFuncs.length == 0 && feeFuncs.length == 0) {
      return;
    }

    const newestCommitData = _.cloneDeep(this.newestCommitData);

    for (let i = 0; i < optFuncs.length; i++) {
      const optFunc = optFuncs[i];
      const optRes = optReses[i];

      if (optFunc) {
        newestCommitData.op.data.push(
          convertFuncInternal2Inscription(optFunc, env.BestHeight)
        );
        newestCommitData.result.push(optRes.result);
      }

      const feeFunc = feeFuncs[i];
      const feeRes = feeReses[i];
      const feeAmount = parseFloat(req.req.feeAmount);
      if (feeFunc && req.req.payType == PayType.tick && feeAmount > 0) {
        newestCommitData.op.data.push(
          convertFuncInternal2Inscription(feeFunc, env.BestHeight)
        );
        newestCommitData.result.push(feeRes.result);
      }
    }

    const commitObjs = await this.getVerifyCommits(newestCommitData.op);
    const commits = commitObjs.map((item) => {
      return JSON.stringify(item);
    });
    let results = this.convertResultFormat(newestCommitData.result) as Result[];

    // Need to extract asset information involved in the pre-commit tick for indexing to verify.
    if (commits.length > 1) {
      results = _.cloneDeep(results);

      let extraResult: Result = {
        users: [],
        pools: [],
      };
      for (let i = 0; i < commitObjs.length - 1; i++) {
        const commit = commitObjs[i];
        for (let j = 0; j < commit.data.length; j++) {
          const func = convertFuncInscription2Internal(
            j,
            commit,
            env.BestHeight
          );
          const res = this.pendingSpace.getCurResult(func);
          extraResult.pools.push(...(res.pools || []));
          extraResult.users.push(...(res.users || []));
        }
      }
      // logger.debug({
      //   tag: TAG,
      //   msg: "extraResult",
      //   extraResult,
      //   assets: tmpPendingSpace.Assets,
      // });
      extraResult = this.convertResultFormat([extraResult])[0];

      const resultsMap: { [key: string]: any } = {};
      results.forEach((result) => {
        result.pools?.forEach((pool) => {
          resultsMap[`${pool.pair}`] = pool;
        });
        result.users?.forEach((user) => {
          resultsMap[`${user.address}-${user.tick}`] = user;
        });
      });

      const lastResult = results[results.length - 1];
      // logger.debug({ tag: TAG, msg: "add extra result before", lastResult });

      for (let i = 0; i < extraResult.pools.length; i++) {
        const pool = extraResult.pools[i];
        if (!resultsMap[pool.pair]) {
          if (!lastResult.pools) {
            lastResult.pools = [];
          }
          lastResult.pools.push(pool);
        }
      }

      for (let i = 0; i < extraResult.users.length; i++) {
        const user = extraResult.users[i];
        if (!resultsMap[`${user.address}-${user.tick}`]) {
          if (!lastResult.users) {
            lastResult.users = [];
          }
          lastResult.users.push(user);
        }
      }

      // logger.debug({ tag: TAG, msg: "add extra result after", lastResult });
    }

    need(newestCommitData.op.data.length == results.length);
    const verifyParams = {
      commits,
      results,
    };
    const res = await api.commitVerify(verifyParams);

    if (!res.valid) {
      logger.error({ tag: TAG, msg: "verify test fail", req, res });
    }
    need(res.valid, validation_error);
  }

  async verify(req: FuncReq) {
    const { optFunc, optRes, feeFunc, feeRes } = this.__aggregate(req, true);

    if (!optFunc && !feeFunc) {
      return;
    }

    const newestCommitData = _.cloneDeep(this.newestCommitData);

    if (optFunc) {
      newestCommitData.op.data.push(
        convertFuncInternal2Inscription(optFunc, env.BestHeight)
      );
      newestCommitData.result.push(optRes.result);
    }

    const feeAmount = parseFloat(req.req.feeAmount);
    if (req.req.payType == PayType.tick && feeAmount > 0) {
      newestCommitData.op.data.push(
        convertFuncInternal2Inscription(feeFunc, env.BestHeight)
      );
      newestCommitData.result.push(feeRes.result);
    }

    const commitObjs = await this.getVerifyCommits(newestCommitData.op);
    const commits = commitObjs.map((item) => {
      return JSON.stringify(item);
    });
    let results = this.convertResultFormat(newestCommitData.result) as Result[];

    // Need to extract asset information involved in the pre-commit tick for indexing to verify.
    if (commits.length > 1) {
      results = _.cloneDeep(results);

      let extraResult: Result = {
        users: [],
        pools: [],
      };
      for (let i = 0; i < commitObjs.length - 1; i++) {
        const commit = commitObjs[i];
        for (let j = 0; j < commit.data.length; j++) {
          const func = convertFuncInscription2Internal(
            j,
            commit,
            env.BestHeight
          );
          const res = this.pendingSpace.getCurResult(func);
          extraResult.pools.push(...(res.pools || []));
          extraResult.users.push(...(res.users || []));
        }
      }
      // logger.debug({
      //   tag: TAG,
      //   msg: "extraResult",
      //   extraResult,
      //   assets: tmpPendingSpace.Assets,
      // });
      extraResult = this.convertResultFormat([extraResult])[0];

      const resultsMap: { [key: string]: any } = {};
      results.forEach((result) => {
        result.pools?.forEach((pool) => {
          resultsMap[`${pool.pair}`] = pool;
        });
        result.users?.forEach((user) => {
          resultsMap[`${user.address}-${user.tick}`] = user;
        });
      });

      const lastResult = results[results.length - 1];
      // logger.debug({ tag: TAG, msg: "add extra result before", lastResult });

      for (let i = 0; i < extraResult.pools.length; i++) {
        const pool = extraResult.pools[i];
        if (!resultsMap[pool.pair]) {
          if (!lastResult.pools) {
            lastResult.pools = [];
          }
          lastResult.pools.push(pool);
        }
      }

      for (let i = 0; i < extraResult.users.length; i++) {
        const user = extraResult.users[i];
        if (!resultsMap[`${user.address}-${user.tick}`]) {
          if (!lastResult.users) {
            lastResult.users = [];
          }
          lastResult.users.push(user);
        }
      }

      // logger.debug({ tag: TAG, msg: "add extra result after", lastResult });
    }

    need(newestCommitData.op.data.length == results.length);
    const verifyParams = {
      commits,
      results,
    };
    const res = await api.commitVerify(verifyParams);

    if (!res.valid) {
      logger.error({
        tag: TAG,
        msg: "verify test fail",
        verifyParams,
        req,
        res,
      });
    }
    need(res.valid, validation_error);
  }

  async batchAggregate(reqs: FuncReq[], test = false) {
    if (config.readonly) {
      throw new Error(current_operations_are_not_allowed);
    }

    // not error
    let ret: {
      optFunc: InternalFunc;
      feeFunc: InternalFunc;
      optRes: ContractResult;
      feeRes: ContractResult;
    }[] = [];
    if (test) {
      for (let i = 0; i < reqs.length; i++) {
        const req = reqs[i];
        ret.push(this.__aggregate(req, true));
      }
      return ret;
    }

    // verify per req
    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];

      await checkAccess(req.req.address);

      const ids = await this.getUnConfirmedOpCommitIds();
      if (ids.length >= config.verifyCommitFatalNum) {
        throw new Error(wait_for_rollup);
      }

      this.checkSystemStatus();
      checkFuncReq(req);
      checkAddressType(req.req.address);

      if (config.verifyPerOpt) {
        await this.verify(req);
      }
      ret.push(this.__aggregate(req));
    }

    for (let i = 0; i < ret.length; i++) {
      await this.updateDaoAfterAggregate({ req: reqs[i], ...ret[i] });
    }
  }

  private async updateDaoAfterAggregate(params: {
    req: FuncReq;
    optFunc: InternalFunc;
    feeFunc: InternalFunc;
    optRes: ContractResult;
    feeRes: ContractResult;
  }) {
    const { req, optFunc, feeFunc, optRes, feeRes } = params;
    try {
      const assetList = this.pendingSpace.NotifyDataCollector.AssetList;
      for (let i = 0; i < assetList.length; i++) {
        const item = assetList[i];
        let tickDecimal: string;
        if (isLp(item.raw.tick)) {
          tickDecimal = LP_DECIMAL;
        } else {
          tickDecimal = decimal.get(item.raw.tick);
        }
        await mongoUtils.startTransaction(async (session) => {
          await assetDao.upsertData(
            {
              assetType: item.raw.assetType,
              tick: item.raw.tick,
              address: item.raw.address,
              balance: item.raw.balance,
              cursor: PENDING_CURSOR,
              height: UNCONFIRM_HEIGHT,
              commitParent: this.newestCommitData.op.parent,
              displayBalance: bnDecimal(item.raw.balance, tickDecimal),
            },
            { session }
          );
          await assetSupplyDao.upsertData(
            {
              cursor: PENDING_CURSOR,
              height: UNCONFIRM_HEIGHT,
              commitParent: this.newestCommitData.op.parent,
              tick: item.raw.tick,
              assetType: item.raw.assetType,
              supply:
                this.pendingSpace.Assets.dataRefer()[item.raw.assetType][
                  item.raw.tick
                ]?.Supply || "0",
            },
            { session }
          );
        });
        this.pendingSpace.NotifyDataCollector.reset(
          this.pendingSpace.LastHandledApiEvent.cursor
        );
      }

      let data: Partial<PayData> = {
        address: req.req.address,
        rememberPayType: req.req.rememberPayType,
      };
      if (req.req.rememberPayType) {
        data.defaultPayType = req.req.payType;
      }
      await payDao.upsertData(data);
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "asset-update-fail-2",
        error: err.message,
        stack: err.stack,
      });
    }

    if (optFunc) {
      // try insert and excute
      let ret: any;
      try {
        ret = await record("", optFunc, optRes);
        if (feeFunc && parseFloat(req.req.feeAmount) > 0) {
          await record("", feeFunc, feeRes);
        }
      } catch (err) {
        logger.error({
          tag: TAG,
          req,
          optFunc,
          feeFunc,
          msg: "record-update-fail",
          error: err.message,
          stack: err.stack,
        });
      }

      const item = this.preResMap[optFunc.id];
      if (item && params.req.req.payType == PayType.freeQuota) {
        try {
          await api.useFreeQuota({
            address: req.req.address,
            tick: DEFAULT_GAS_TICK,
            amount: item.res.usageFreeQuota,
            type: "swap",
            timestamp: Date.now(),
          });
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "free-quota-update-fail",
            error: err.message,
            stack: err.stack,
          });
        }
      }

      return ret;
    } else {
      try {
        if (parseFloat(req.req.feeAmount) > 0) {
          await record("", feeFunc, feeRes);
        }
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "record-update-fail",
          error: err.message,
          stack: err.stack,
        });
      }

      const item = this.preResMap[feeFunc.id];
      if (item && params.req.req.payType == PayType.freeQuota) {
        try {
          await api.useFreeQuota({
            address: req.req.address,
            tick: DEFAULT_GAS_TICK,
            amount: item.res.usageFreeQuota,
            type: "swap",
            timestamp: Date.now(),
          });
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "free-quota-update-fail",
            error: err.message,
            stack: err.stack,
          });
        }
      }
      return null;
    }
  }

  async batchAggregate2(req: BatchFuncReq, test = false) {
    if (config.readonly) {
      throw new Error(current_operations_are_not_allowed);
    }

    const freeQuotaRes = await this.getFreeQuota(
      req.req.address,
      DEFAULT_GAS_TICK
    );
    if (freeQuotaRes.hasVoucher) {
      req.req.payType = PayType.freeQuota;
    }

    await checkAccess(req.req.address);

    const ids = await this.getUnConfirmedOpCommitIds();
    if (ids.length >= config.verifyCommitFatalNum) {
      throw new Error(wait_for_rollup);
    }

    this.checkSystemStatus();

    const reqs = batchReqToReqs(req);
    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];
      checkFuncReq(req);
      checkAddressType(req.req.address);
    }

    if (config.verifyPerOpt) {
      await this.batchVerify(req);
    }

    const { optFuncs, optReses, feeFuncs, feeReses } = this.__batchAggregate(
      req,
      test
    );
    if (test) {
      return { optFuncs, optReses, feeFuncs, feeReses };
    }

    query.clearCache(req.req.address);

    for (let i = 0; i < reqs.length; i++) {
      await this.updateDaoAfterAggregate({
        req: reqs[i],
        optFunc: optFuncs[i],
        feeFunc: feeFuncs[i],
        optRes: optReses[i],
        feeRes: feeReses[i],
      });
    }
    return {};
  }

  async aggregate(req: FuncReq, test = false, disableVoucher = false) {
    if (config.readonly) {
      throw new Error(current_operations_are_not_allowed);
    }

    if (req.func !== FuncType.swap) {
      need(req.req.payType !== PayType.assetFeeTick, `Invalid payType`);
    }

    const freeQuotaRes = await this.getFreeQuota(
      req.req.address,
      DEFAULT_GAS_TICK
    );
    if (freeQuotaRes.hasVoucher && !disableVoucher) {
      req.req.payType = PayType.freeQuota;
    }

    await checkAccess(req.req.address);

    const ids = await this.getUnConfirmedOpCommitIds();
    if (ids.length >= config.verifyCommitFatalNum) {
      throw new Error(wait_for_rollup);
    }

    this.checkSystemStatus();
    checkFuncReq(req);
    checkAddressType(req.req.address);

    if (config.verifyPerOpt) {
      await this.verify(req);
    }

    const { optFunc, optRes, feeFunc, feeRes } = this.__aggregate(req, test);
    if (test) {
      return { optFunc, optRes, feeFunc, feeRes };
    }

    query.clearCache(req.req.address);

    return await this.updateDaoAfterAggregate({
      req,
      optFunc,
      optRes,
      feeFunc,
      feeRes,
    });
  }

  async trySave() {
    if (!keyring.sequencerWallet.isWatchOnly()) {
      await opCommitDao.upsertByParent(
        this.newestCommitData.op.parent,
        this.newestCommitData
      );
    }
  }

  reachCommitCondition() {
    const reachMax =
      this.newestCommitData.op.data.length >= config.commitPerSize;
    const reachTime =
      this.newestCommitData.op.data.length > 0 &&
      config.openCommitPerMinute &&
      Date.now() - this.firstAggregateTimestamp >
        config.commitPerMinute * 60 * 1000;
    return reachMax || reachTime;
  }

  private convertResultFormat(results: Result[]) {
    const ret = results.map((result) => {
      const ret = {};
      if (result.users) {
        ret["users"] = result.users.map((user) => {
          return {
            address: user.address,
            balance: user.balance,
            tick: isLp(user.tick)
              ? convertPairStrV2ToPairStrV1(user.tick)
              : user.tick,
            lockedBalance: user.lockedBalance,
          };
        });
      }
      if (result.pools) {
        ret["pools"] = result.pools.map((pool) => {
          return {
            pair: convertPairStrV2ToPairStrV1(pool.pair),
            reserve0: pool.reserve0,
            reserve1: pool.reserve1,
            lp: pool.lp,
          };
        });
      }
      return ret;
    });
    return ret;
  }

  async tryCommit() {
    if (this.reachCommitCondition() && !this.newestCommitData.inscriptionId) {
      this.tryCommitCount++;
      logger.debug({
        tag: TAG,
        msg: "try commit",
        tryCommitCount: this.tryCommitCount,
        parent: this.newestCommitData.op.parent,
      });
      const commitObjs = await this.getVerifyCommits(this.newestCommitData.op);
      const commits = commitObjs.map((item) => {
        return JSON.stringify(item);
      });
      let results = this.convertResultFormat(
        this.newestCommitData.result
      ) as Result[];

      // Need to extract asset information involved in the pre-commit tick for indexing to verify.
      if (commits.length > 1) {
        results = _.cloneDeep(results);

        let extraResult: Result = {
          users: [],
          pools: [],
        };
        for (let i = 0; i < commitObjs.length - 1; i++) {
          const commit = commitObjs[i];
          for (let j = 0; j < commit.data.length; j++) {
            const func = convertFuncInscription2Internal(
              j,
              commit,
              env.BestHeight
            );
            const res = this.pendingSpace.getCurResult(func);
            extraResult.pools.push(...(res.pools || []));
            extraResult.users.push(...(res.users || []));
          }
        }
        extraResult = this.convertResultFormat([extraResult])[0];

        const lastResult = results[results.length - 1];
        // logger.debug({ tag: TAG, msg: "add extra result before", lastResult });
        if (!lastResult.pools) {
          lastResult.pools = [];
        }
        lastResult.pools.push(...extraResult.pools);
        if (!lastResult.users) {
          lastResult.users = [];
        }
        lastResult.users.push(...extraResult.users);
        // logger.debug({ tag: TAG, msg: "add extra result after", lastResult });
      }

      const parent = this.newestCommitData.op.parent;
      need(this.newestCommitData.op.data.length == results.length);
      const verifyParams = {
        commits,
        results,
      };
      const res = await api.commitVerify(verifyParams);
      if (!res.valid) {
        logger.debug({
          tag: TAG,
          msg: "verify fail, parent: " + parent,
          commits,
          results,
          hash: hash(verifyParams),
          tryCommitCount: this.tryCommitCount,
          res,
        });
        if (config.verifyCommitInvalidException) {
          await sleep(10_000);
          this.verifyFailCount++;
          builder.forceReset = true;
          throw new Error("verify fail, try again");
        }
      }
      if (this.tryCommitCount > 1) {
        logger.debug({
          tag: TAG,
          msg: "multi verify success, parent: " + parent,
          commits,
          results,
          hash: hash(verifyParams),
          tryCommitCount: this.tryCommitCount,
          res,
        });
      }
      await sender.pushCommitOp(this.newestCommitData.op);
      this.tryCommitCount = 0;
      this.verifyFailCount = 0;
      this.lastCommitTime = Date.now();

      logger.debug({
        tag: TAG,
        msg: "verify commit",
        tryCommitCount: this.tryCommitCount,
        inscriptionId: this.newestCommitData.inscriptionId,
      });
      // this.pendingSpace.setLastCommitId(this.newestCommitData.inscriptionId);
    }
  }

  private getAdjustedGasPrice(gasPrice: string) {
    if (env.BestHeight < config.updateHeight1) {
      return decimalCal([gasPrice, "mul", config.userFeeRateRatio]);
    } else {
      return decimalCal([
        gasPrice,
        "mul",
        config.userFeeRateRatio,
        "mul",
        400, // Assume fixed length
      ]);
    }
  }

  async tryNewCommitOp() {
    if (this.newestCommitData.inscriptionId && !sender.Committing) {
      const priceInfo = await this.calculateCurPriceInfo();
      const gas_price = this.getAdjustedGasPrice(priceInfo.gasPrice);
      logger.debug({
        tag: TAG,
        msg: "tryNewCommitOp",
        parent: this.newestCommitData.op.parent,
      });
      this.newestCommitData = {
        op: {
          p: "brc20-swap",
          op: OpType.commit,
          module: config.moduleId,
          parent: this.newestCommitData.inscriptionId,
          gas_price,
          data: [],
        },
        feeRate: priceInfo.feeRate,
        satsPrice: priceInfo.satsPrice,
        result: [],
        height: UNCONFIRM_HEIGHT,
      };
      if (config.swapFeeRate) {
        this.newestCommitData.op.swap_fee_rate = config.swapFeeRate.toString();
      }
      need(!!this.newestCommitData.op.gas_price);
      await this.trySave();
    }
  }
}
