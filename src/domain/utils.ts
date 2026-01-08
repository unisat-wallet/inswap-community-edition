import * as bitcoin from "bitcoinjs-lib";
import { ECPair } from ".";
import {
  bn,
  bnDecimal,
  bnDecimalPlacesValid,
  bnIsInteger,
  decimalCal,
  uintCal,
} from "../contract/bn";
import { RecordLiqData } from "../dao/record-liq-dao";
import { RecordSwapData } from "../dao/record-swap-dao";
import { ApiEvent, EventType, UTXO } from "../types/api";
import { AddressType, SnapshotObj } from "../types/domain";
import {
  AddLiqOut,
  ContractResult,
  ExactType,
  FuncType,
  InscriptionFunc,
  InternalFunc,
  RemoveLiqOut,
  SwapOut,
} from "../types/func";
import { CommitOp, OpEvent, OpType } from "../types/op";
import { PsbtInputExtended } from "../types/psbt";
import { BatchFuncReq, FuncReq, NetworkType, PayType } from "../types/route";
import {
  DUST330,
  DUST546,
  LP_DECIMAL,
  QUOTA_ASSETS,
  UNCONFIRM_HEIGHT,
  ZERO_ADDRESS,
} from "./constant";
import {
  access_denied,
  CodeEnum,
  CodeError,
  deposit_delay_swap,
  fee_tick_invalid,
  internal_server_error,
  invalid_address,
  invalid_aggregation,
  invalid_amount,
  invalid_slippage,
  invalid_ts,
  not_support_address,
  paramsMissing,
  tick_disable,
  utxo_not_enough,
  invalid_time_uint,
  invalid_lock_day,
} from "./error";
import bitcore from "bitcore-lib";
import _ from "lodash";
import { Brc20 } from "../contract/brc20";
import {
  getPairStructV2,
  getPairStrV1,
  getPairStrV2,
  sortTickParams,
} from "../contract/contract-utils";
import { RecordApproveData } from "../dao/record-approve-dao";
import { RecordGasData } from "../dao/record-gas-dao";
import { RecordSendData } from "../dao/record-send-dao";
import { toXOnly } from "../lib/bitcoin";
import { Space } from "./space";

const TAG = "utils";

/**
 * An exception will be thrown if the condition is not met.
 */
export function need(
  condition: boolean,
  msg?: string,
  code?: CodeEnum,
  fatal = false
) {
  if (!condition) {
    code = code ?? (-1 as CodeEnum);
    if (fatal) {
      global.fatal = true;
      logger.fatal({ tag: "need", msg });
      // process.exit(1);
    }
    throw new CodeError(msg || `${internal_server_error}: ${code}`, code);
  }
}

/**
 * Calculate the total satoshi of UTXOs.
 */
export function getInputAmount(utxos: UTXO[]) {
  let ret = 0;
  for (let i = 0; i < utxos.length; i++) {
    ret += utxos[i].satoshi;
  }
  return ret;
}

/**
 * Calculate the confirmations
 */
export function heightConfirmNum(height: number) {
  if (height == UNCONFIRM_HEIGHT) {
    return 0;
  } else {
    return Math.max(0, env.BestHeight - height + 1);
  }
}

/**
 * Is valid brc20 ticker
 * e.g. "ordi"
 */
export function isBrc20(tick: string) {
  return Buffer.from(tick).length == 4;
}

export function isLp(tick: string) {
  try {
    const pair = getPairStructV2(tick);
    return getPairStrV2(pair.tick0, pair.tick1) == tick;
  } catch (err) {
    return false;
  }
}

/**
 * To validate PSBT
 */
export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

/**
 * Create an record into database
 */
let lastRecordParams: {
  rollupInscriptionId: string;
  item: InternalFunc;
  res: ContractResult;
};
export async function record(
  rollupInscriptionId: string,
  item: InternalFunc,
  res: ContractResult
) {
  let ret: RecordSwapData | RecordLiqData | RecordApproveData | RecordSendData =
    {} as any;
  item.params = sortTickParams(item.params);

  delete ret.preResult;
  delete ret.result;
  if (item.func == FuncType.deployPool) {
    if (parseFloat(res.gas) > 0) {
      const gasRecord: RecordGasData = {
        id: item.id,
        address: item.params.address,
        funcType: FuncType.deployPool,
        tickA: item.params.tick0,
        tickB: item.params.tick1,
        gas: res.gas,
        tick: env.ModuleInitParams.gas_tick,
        ts: item.ts,
        success: res.success,
      };
      await recordGasDao.upsertData(gasRecord);
    }
  } else if (item.func == FuncType.addLiq) {
    if (parseFloat(res.gas) > 0) {
      const gasRecord: RecordGasData = {
        id: item.id,
        address: item.params.address,
        funcType: FuncType.addLiq,
        tickA: item.params.tick0,
        tickB: item.params.tick1,
        gas: res.gas,
        tick: env.ModuleInitParams.gas_tick,
        ts: item.ts,
        success: res.success,
      };
      await recordGasDao.upsertData(gasRecord);
    }

    const out = res.out as AddLiqOut;
    let value = 0;
    let tick0Price = 0;
    let tick1Price = 0;
    try {
      tick0Price = await query.getTickPrice(item.params.tick0);
      tick1Price = await query.getTickPrice(item.params.tick1);
      const tick0Amount = bnDecimal(
        out.amount0,
        decimal.get(item.params.tick0)
      );
      const tick1Amount = bnDecimal(
        out.amount1,
        decimal.get(item.params.tick1)
      );
      // tick0Price * tick0Amount + tick1Price * tick1Amount
      const tick0Value = decimalCal([tick0Price, "mul", tick0Amount]);
      const tick1Value = decimalCal([tick1Price, "mul", tick1Amount]);
      value = parseFloat(decimalCal([tick0Value, "add", tick1Value]));
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "record addLiq error",
        error: err.message,
        stack: err.stack,
      });
    }

    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      type: "add",
      tick0: item.params.tick0,
      tick1: item.params.tick1,
      amount0: bnDecimal(out.amount0, decimal.get(item.params.tick0)),
      amount1: bnDecimal(out.amount1, decimal.get(item.params.tick1)),
      lp: bnDecimal(out.lp, LP_DECIMAL),
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
      success: res.success,
      value,
    };
    if (!value) {
      delete ret.value;
    }
    if (config.lpExceptionValue && value > config.lpExceptionValue) {
      logger.error({
        tag: TAG,
        msg: "record addLiq error",
        value,
        tick0: item.params.tick0,
        tick1: item.params.tick1,
        amount0: bnDecimal(out.amount0, decimal.get(item.params.tick0)),
        amount1: bnDecimal(out.amount1, decimal.get(item.params.tick1)),
        tick0Price,
        tick1Price,
      });
    }

    await recordLiqDao.upsertData(ret);
  } else if (item.func == FuncType.swap) {
    if (parseFloat(res.gas) > 0) {
      const gasRecord: RecordGasData = {
        id: item.id,
        address: item.params.address,
        funcType: FuncType.swap,
        tickA: item.params.tickIn,
        tickB: item.params.tickOut,
        gas: res.gas,
        tick: env.ModuleInitParams.gas_tick,
        ts: item.ts,
        success: res.success,
      };
      await recordGasDao.upsertData(gasRecord);
    }

    const out = res.out as SwapOut;
    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      tickIn: item.params.tickIn,
      tickOut: item.params.tickOut,
      amountIn:
        item.params.exactType == ExactType.exactIn
          ? item.params.amount
          : out.amount,
      amountOut:
        item.params.exactType == ExactType.exactOut
          ? item.params.amount
          : out.amount,
      exactType: item.params.exactType,
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
      success: res.success,
      value: 0,
    };
    ret.amountIn = bnDecimal(ret.amountIn, decimal.get(ret.tickIn));
    ret.amountOut = bnDecimal(ret.amountOut, decimal.get(ret.tickOut));
    let tickInPrice = 0;
    let tickOutPrice = 0;
    try {
      tickInPrice = await query.getTickPrice(item.params.tickIn);
      tickOutPrice = await query.getTickPrice(item.params.tickOut);
      const value0 = parseFloat(decimalCal([tickInPrice, "mul", ret.amountIn]));
      const value1 = parseFloat(
        decimalCal([tickOutPrice, "mul", ret.amountOut])
      );
      ret.value = Math.min(value0, value1);
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "record swap error",
        error: err.message,
        stack: err.stack,
      });
    }
    if (config.swapExceptionValue && ret.value > config.swapExceptionValue) {
      logger.error({
        tag: TAG,
        msg: "record swap error",
        value: ret.value,
        tickIn: item.params.tickIn,
        tickOut: item.params.tickOut,
        tickInPrice,
        tickOutPrice,
        amountIn: ret.amountIn,
        amountOut: ret.amountOut,
      });
    }

    await recordSwapDao.upsertData(ret);
  } else if (item.func == FuncType.removeLiq) {
    if (parseFloat(res.gas) > 0) {
      const gasRecord: RecordGasData = {
        id: item.id,
        address: item.params.address,
        funcType: FuncType.removeLiq,
        tickA: item.params.tick0,
        tickB: item.params.tick1,
        gas: res.gas,
        tick: env.ModuleInitParams.gas_tick,
        ts: item.ts,
        success: res.success,
      };
      await recordGasDao.upsertData(gasRecord);
    }
    const out = res.out as RemoveLiqOut;

    let value = 0;
    let tick0Price = 0;
    let tick1Price = 0;
    try {
      tick0Price = await query.getTickPrice(item.params.tick0);
      tick1Price = await query.getTickPrice(item.params.tick1);
      const tick0Amount = bnDecimal(
        out.amount0,
        decimal.get(item.params.tick0)
      );
      const tick1Amount = bnDecimal(
        out.amount1,
        decimal.get(item.params.tick1)
      );
      // tick0Price * tick0Amount + tick1Price * tick1Amount
      const tick0Value = decimalCal([tick0Price, "mul", tick0Amount]);
      const tick1Value = decimalCal([tick1Price, "mul", tick1Amount]);
      value = parseFloat(decimalCal([tick0Value, "add", tick1Value]));

      const reward0Value = decimalCal([tick0Price, "mul", bn(out.reward0)]);
      const reward1Value = decimalCal([tick1Price, "mul", bn(out.reward1)]);
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "record removeLiq error",
        message: err.message,
        stack: err.stack,
      });
    }

    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      type: "remove",
      tick0: item.params.tick0,
      tick1: item.params.tick1,
      amount0: bnDecimal(out.amount0, decimal.get(item.params.tick0)),
      amount1: bnDecimal(out.amount1, decimal.get(item.params.tick1)),
      lp: bnDecimal(item.params.lp, LP_DECIMAL),
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
      reward0: out.reward0,
      reward1: out.reward1,
      success: res.success,
      value,
    };
    if (!value) {
      delete ret.value;
    }
    if (config.lpExceptionValue && value > config.lpExceptionValue) {
      logger.error({
        tag: TAG,
        msg: "record removeLiq error",
        value,
        tick0: item.params.tick0,
        tick1: item.params.tick1,
        amount0: bnDecimal(out.amount0, decimal.get(item.params.tick0)),
        amount1: bnDecimal(out.amount1, decimal.get(item.params.tick1)),
        tick0Price,
        tick1Price,
      });
    }
    await recordLiqDao.upsertData(ret);

    if (bn(out.reward0).gt(0) && bn(out.reward1).gt(0)) {
      await lpRewardHistoryDao.upsertData({
        id: ret.id,
        type: "lp-reward",
        address: ret.address,
        tick0: ret.tick0,
        tick1: ret.tick1,
        reward0: out.reward0,
        reward1: out.reward1,
        ts: ret.ts,
      });
    }
  } else if (item.func == FuncType.decreaseApproval) {
    if (parseFloat(res.gas) > 0) {
      const gasRecord: RecordGasData = {
        id: item.id,
        address: item.params.address,
        funcType: FuncType.decreaseApproval,
        tickA: item.params.tick,
        tickB: null,
        gas: res.gas,
        tick: env.ModuleInitParams.gas_tick,
        ts: item.ts,
        success: res.success,
      };
      await recordGasDao.upsertData(gasRecord);
    }

    ret = {
      id: item.id,
      rollupInscriptionId,
      address: item.params.address,
      tick: item.params.tick,
      amount: bnDecimal(item.params.amount, decimal.get(item.params.tick)),
      type: "decreaseApprove",
      ts: item.ts,
      preResult: res.preResult,
      result: res.result,
      success: res.success,
    };
    await recordApproveDao.upsertData(ret);
  } else if (item.func == FuncType.send || item.func == FuncType.sendLp) {
    if (parseFloat(res.gas) > 0) {
      if (item.func == FuncType.send) {
        const gasRecord: RecordGasData = {
          id: item.id,
          address: item.params.address,
          funcType: FuncType.send,
          tickA: item.params.tick,
          tickB: null,
          gas: res.gas,
          tick: env.ModuleInitParams.gas_tick,
          ts: item.ts,
          success: res.success,
          to: item.params.to,
        };
        await recordGasDao.upsertData(gasRecord);
      } else {
        const { tick0, tick1 } = getPairStructV2(item.params.tick);
        const gasRecord: RecordGasData = {
          id: item.id,
          address: item.params.address,
          funcType: FuncType.sendLp,
          tickA: tick0,
          tickB: tick1,
          gas: res.gas,
          tick: env.ModuleInitParams.gas_tick,
          ts: item.ts,
          success: res.success,
          to: item.params.to,
        };
        await recordGasDao.upsertData(gasRecord);
      }
    }

    if (item.params.to == env.ModuleInitParams.gas_to) {
      need(!!lastRecordParams);
      let tickA: string;
      let tickB: string;
      let funcType = lastRecordParams.item.func;
      if (lastRecordParams.item.func == FuncType.swap) {
        tickA = lastRecordParams.item.params.tickIn;
        tickB = lastRecordParams.item.params.tickOut;
      } else if (
        lastRecordParams.item.func == FuncType.addLiq ||
        lastRecordParams.item.func == FuncType.removeLiq ||
        lastRecordParams.item.func == FuncType.deployPool
      ) {
        tickA = lastRecordParams.item.params.tick0;
        tickB = lastRecordParams.item.params.tick1;
      } else if (
        lastRecordParams.item.func == FuncType.decreaseApproval ||
        lastRecordParams.item.func == FuncType.send
      ) {
        tickA = lastRecordParams.item.params.tick;
        tickB = null;
        if (stakePoolMgr.isPoolAddr(lastRecordParams.item.params.address)) {
          funcType = FuncType.claim as any;
        }
      } else if (lastRecordParams.item.func == FuncType.sendLp) {
        const { tick0, tick1 } = getPairStructV2(
          lastRecordParams.item.params.tick
        );
        tickA = tick0;
        tickB = tick1;
      } else if (
        lastRecordParams.item.func == FuncType.lock ||
        lastRecordParams.item.func == FuncType.unlock
      ) {
        if (isLp(lastRecordParams.item.params.tick)) {
          const { tick0, tick1 } = getPairStructV2(
            lastRecordParams.item.params.tick
          );
          tickA = tick0;
          tickB = tick1;
        } else {
          tickA = lastRecordParams.item.params.tick;
          tickB = null;
        }
      }
      const gasRecord: RecordGasData = {
        id: lastRecordParams.item.id,
        address: item.params.address,
        funcType,
        tickA,
        tickB,
        gas: bnDecimal(item.params.amount, decimal.get(item.params.tick)),
        tick: item.params.tick,
        ts: item.ts,
        success: res.success,
      };
      await recordGasDao.upsertData(gasRecord);
    } else {
      const _isLp = isLp(item.params.tick);
      let _decimal: string;
      let tick: string;
      if (_isLp) {
        _decimal = LP_DECIMAL;
        const { tick0, tick1 } = getPairStructV2(item.params.tick);
        tick = getPairStrV1(tick0, tick1);
      } else {
        _decimal = decimal.get(item.params.tick);
        tick = item.params.tick;
      }
      ret = {
        id: item.id,
        rollupInscriptionId,
        address: item.params.address,
        tick,
        amount: bnDecimal(item.params.amount, _decimal),
        to: item.params.to,
        ts: item.ts,
        preResult: res.preResult,
        result: res.result,
        success: res.success,
      };
      if (_isLp) {
        ret.isLp = true;
        const { tick0, tick1 } = getPairStructV2(item.params.tick);
        let lpInfo:
          | {
              amount0: string;
              amount1: string;
              value: number;
            }
          | undefined;
        try {
          lpInfo = await getLpInfo({
            tick0,
            tick1,
            lp: ret.amount,
          });
        } catch (e) {}
        if (lpInfo) {
          ret.sendLpResult = {
            amount0: lpInfo.amount0,
            amount1: lpInfo.amount1,
            lp: ret.amount,
            value: lpInfo.value,
          };
        }
      }
      await recordSendDao.upsertData(ret);
    }
  }

  lastRecordParams = {
    rollupInscriptionId,
    item,
    res,
  };

  return ret;
}

export const getModuleIdHex = (moduleId?: string) => {
  const str = (moduleId || config.moduleId).split("i")[0];
  const hash = reverseHash(str);
  return Buffer.from(hash, "hex");
};

export const reverseHash = (hash: string) => {
  const arr: string[] = [];
  for (let i = 0; i < hash.length; i += 2) {
    arr.push(hash.slice(i, i + 2));
  }
  return arr.reverse().join("");
};

export function getFuncInternalLength(func: InscriptionFunc) {
  return Buffer.from(JSON.stringify(func)).length;
}

export function estimateServerFee(
  req: FuncReq,
  appendCostUsd?: number,
  skipCheckFeeTick?: boolean
): {
  feeAmount: string;
  feeTickPrice: string;
  feeBalance: string;
  usdPrice: string;
} {
  if (!skipCheckFeeTick) {
    checkFeeTick(req.req.feeTick);
  }

  const feeBalance = operator.PendingSpace.getTickBalance(
    req.req.address,
    req.req.feeTick
  ).swap;

  let feeAmount: string;
  let cost = 0;
  if (config.fixedFeeAmount) {
    feeAmount = config.fixedFeeAmount;
    cost = parseFloat(
      decimalCal([feeAmount, "mul", req.req.feeTickPrice], "6")
    );
  } else {
    const feeRate = Math.max(config.minFeeRate, env.FeeRate * 2);
    cost =
      (400 / 4) /* Number of simulated bytes */ *
      2 /** Number of transaction */ *
      feeRate *
      parseFloat(env.FbSatsPrice) *
      config.userFeeRateRatio;
    if (appendCostUsd > 0) {
      cost += appendCostUsd;
    }
    need(parseFloat(req.req.feeTickPrice) > 0, "Fee tick price error");
    feeAmount = decimalCal(
      [cost, "div", req.req.feeTickPrice],
      decimal.get(req.req.feeTick)
    );
    need(parseFloat(feeAmount) > 0, "Fee amount error");
  }

  return {
    feeBalance,
    feeAmount,
    feeTickPrice: req.req.feeTickPrice,
    usdPrice: cost.toString(),
  };
}

export function estimateBatchServerFee(
  req: BatchFuncReq,
  appendCostUsd?: number
): {
  feeAmount: string;
  feeTickPrice: string;
  feeBalance: string;
  usdPrice: string;
} {
  checkFeeTick(req.req.feeTick);

  const feeBalance = operator.PendingSpace.getTickBalance(
    req.req.address,
    req.req.feeTick
  ).swap;

  let feeAmount: string;
  let cost = 0;
  if (config.fixedFeeAmount) {
    feeAmount = config.fixedFeeAmount;
    cost = parseFloat(
      decimalCal([feeAmount, "mul", req.req.feeTickPrice], "6")
    );
  } else {
    need(config.feeTicks.includes(req.req.feeTick), "Invalid fee tick");
    const feeRate = Math.max(config.minFeeRate, env.FeeRate * 2);
    cost =
      (400 / 4) /* Number of simulated bytes */ *
      (req.req.to.length + 1) /** Number of transaction */ *
      feeRate *
      parseFloat(env.FbSatsPrice) *
      config.userFeeRateRatio;
    if (appendCostUsd > 0) {
      cost += appendCostUsd;
    }
    need(parseFloat(req.req.feeTickPrice) > 0, "Fee tick price error");
    feeAmount = decimalCal(
      [cost, "div", req.req.feeTickPrice],
      decimal.get(req.req.feeTick)
    );
    need(parseFloat(feeAmount) > 0, "Fee amount error");
  }

  return {
    feeBalance,
    feeAmount,
    feeTickPrice: req.req.feeTickPrice,
    usdPrice: cost.toString(),
  };
}

export const maxAmount = uintCal(["2", "pow", "64"]);

/**
 * Check a function is valid
 */
export function checkFuncReq(req: FuncReq) {
  const func = req.func;

  checkAddressType(req.req.address);
  checkTs(req.req.ts);
  checkFeeTick(req.req.feeTick);
  need(!!req.req.payType, paramsMissing("payType"));
  const allPayType = [PayType.tick, PayType.freeQuota, PayType.assetFeeTick];
  // if (req.func == FuncType.swap || req.func == FuncType.send) {
  //   // send fee
  //   allPayType.push(PayType.assetFeeTick);
  // }
  need(allPayType.includes(req.req.payType));
  // need(!!req.req.sig, "invalid sig");

  if (func == FuncType.addLiq) {
    const { slippage, amount0, amount1, lp, tick0, tick1 } = req.req;
    checkTick(tick0);
    checkTick(tick1);
    checkSlippage(slippage);
    checkAmount(amount0, decimal.get(tick0));
    checkAmount(amount1, decimal.get(tick1));
    checkAmount(lp, LP_DECIMAL);
  } else if (func == FuncType.swap) {
    const { slippage, amountIn, amountOut, tickIn, tickOut } = req.req;
    checkTick(tickIn);
    checkTick(tickOut);
    checkSlippage(slippage);
    checkAmount(amountIn, decimal.get(tickIn));
    checkAmount(amountOut, decimal.get(tickOut));
  } else if (func == FuncType.deployPool) {
    const { tick0, tick1 } = req.req;
    checkTick(tick0);
    checkTick(tick1);
    need(!!decimal.get(tick0));
    need(!!decimal.get(tick1));
  } else if (func == FuncType.removeLiq) {
    const { slippage, amount0, amount1, lp, tick0, tick1 } = req.req;
    checkSlippage(slippage);
    checkTick(tick0);
    checkTick(tick1);
    checkAmount(amount0, decimal.get(tick0));
    checkAmount(amount1, decimal.get(tick1));
    checkAmount(lp, LP_DECIMAL);
  } else if (func == FuncType.decreaseApproval) {
    const { tick, amount } = req.req;
    checkTick(tick);
    checkAmount(amount, decimal.get(tick));
  } else if (func == FuncType.send) {
    const { tick, amount, to } = req.req;
    checkTick(tick);
    checkAmount(amount, decimal.get(tick));
    checkAddress(to);
  } else if (func == FuncType.lock) {
    const { tick0, tick1, amount } = req.req;
    checkTick(tick0);
    checkTick(tick1);
    checkAmount(amount, LP_DECIMAL); //LP
  } else if (func == FuncType.unlock) {
    const { tick0, tick1, amount } = req.req;
    checkTick(tick0);
    checkTick(tick1);
    checkAmount(amount, LP_DECIMAL); //LP
  } else if (func == FuncType.sendLp) {
    const { tick, amount, to } = req.req;
    checkTick(tick);
    checkAmount(amount, LP_DECIMAL);
    checkAddress(to);
  } else if (func == FuncType.claim) {
    //
  } else {
    throw new CodeError(invalid_aggregation);
  }
}

/**
 * Check if an opEvent is valid (commit,deploy,transfer)
 */
export function checkOpEvent(event: OpEvent) {
  const events = [
    EventType.approve,
    EventType.commit,
    EventType.conditionalApprove,
    EventType.inscribeApprove,
    EventType.inscribeConditionalApprove,
    EventType.inscribeModule,
    EventType.transfer,
    EventType.inscribeWithdraw,
    EventType.withdraw,
  ];
  if (!events.includes(event.event)) {
    throw new CodeError("unsupported op: " + event.event);
  }
}

export function isValidAddress(address: string) {
  let error;
  try {
    bitcoin.address.toOutputScript(address, network);
  } catch (e) {
    error = e;
  }
  if (error) {
    return false;
  } else {
    return true;
  }
}

/**
 * Throw system fatal
 * This will result in no longer processing the data.
 * @param message
 */
export function sysFatal(
  obj: object & { tag: string; msg: string; [key: string]: any }
) {
  const err = new Error("System fatal error: " + obj.msg);
  global.fatal = true;
  logger.fatal({
    ...obj,
    stack: err.stack,
  });
  throw err;
}

/**
 * Check if an address is valid. (P2TR/P2WPKH)
 */
export function checkAddressType(address: string) {
  if (address == ZERO_ADDRESS) {
    return;
  }
  need(
    [AddressType.P2TR, AddressType.P2WPKH].includes(getAddressType(address)),
    not_support_address
  );
}

export function checkTs(ts: number) {
  const now = Date.now() / 1000;
  const gap = 600;
  // check 10.0
  need(now - ts > -gap && now - ts < gap && bnIsInteger(ts), invalid_ts);
}

export function checkFeeTick(tick: string) {
  need(config.feeTicks.includes(tick), fee_tick_invalid);
}

export function checkAddress(address: string) {
  need(isValidAddress(address), invalid_address);
}

export function checkAmount(amount: string, decimal: string) {
  need(bn(amount).lt(maxAmount), invalid_amount);
  need(bn(amount).gt("0"), invalid_amount);
  need(bnDecimalPlacesValid(amount, decimal), invalid_amount);
  need(amount == bn(amount).toString(), invalid_amount);
}

export function checkSlippage(slippage: string) {
  need(
    bn(slippage).gte("0") &&
      bn(slippage).lte("1") &&
      bnDecimalPlacesValid(slippage, "3"),
    invalid_slippage
  );
  need(slippage == bn(slippage).toString(), invalid_amount);
}

export function checkLockDay(lockDay: string) {
  need(lockDay.slice(-1) === "d", invalid_lock_day);
}

export function checkTimeUint(timeUint: string) {
  need(["d", "h", "m", "s"].includes(timeUint), invalid_time_uint);
}

/**
 * Decode the type of an address (P2PK/P2PKH/P2SH/P2WPKH/P2WSH/P2TR)
 * throw error when the address is invalid
 */
export function getAddressType(address: string): AddressType {
  let type: AddressType;

  try {
    const decoded = bitcoin.address.fromBase58Check(address);

    if (decoded.version === network.pubKeyHash) {
      type = AddressType.P2PKH;
    } else if (decoded.version === network.scriptHash) {
      type = AddressType.P2SH;
    } else {
      throw new CodeError(`unknown version number: ${decoded.version}`);
    }
  } catch (error) {
    try {
      // not a Base58 address, try Bech32
      const decodedBech32 = bitcoin.address.fromBech32(address);

      if (decodedBech32.version === 0 && decodedBech32.data.length === 20) {
        type = AddressType.P2WPKH;
      } else if (
        decodedBech32.version === 0 &&
        decodedBech32.data.length === 32
      ) {
        type = AddressType.P2WSH;
      } else if (
        decodedBech32.version === 1 &&
        decodedBech32.data.length === 32
      ) {
        type = AddressType.P2TR;
      } else {
        throw new CodeError(`unknown Bech32 address format`);
      }
    } catch (err) {
      throw new CodeError("unsupport address type: " + address);
    }
  }
  return type;
}

export function getDust(address: string) {
  const addressType = getAddressType(address);
  if ([AddressType.P2WPKH, AddressType.P2TR].includes(addressType)) {
    return DUST330;
  } else {
    return DUST546;
  }
}

export function getMixedPayment(pubKey1: Buffer, pubKey2: Buffer) {
  const p2ms = bitcoin.payments.p2ms({
    m: 1,
    pubkeys: [pubKey1, pubKey2],
    network,
  });
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: p2ms,
    network,
  });
  return p2wsh;
}

export function hasFuncType(op: CommitOp, funcType: FuncType) {
  for (let i = 0; i < op.data.length; i++) {
    if (op.data[i].func == funcType) {
      return true;
    }
  }
  return false;
}

export function getMinUTXOs(
  utxos: UTXO[],
  fixedInputNum: number,
  fixedOutputNum: number,
  feeRate: number
): UTXO[] {
  utxos.sort((a, b) => {
    return b.satoshi - a.satoshi;
  });
  const fixed = (fixedInputNum * 68 + fixedOutputNum * 48) * feeRate;

  for (let i = 0; i < utxos.length; i++) {
    if (
      getInputAmount(utxos.slice(0, i + 1)) -
        fixed -
        ((i + 1) * 68 + 48) * feeRate >
      0
    ) {
      return utxos.slice(0, i + 1);
    }
  }
  throw new CodeError(utxo_not_enough);
}

export function getConfirmedNum(height: number) {
  if (height == UNCONFIRM_HEIGHT) {
    return 0;
  } else {
    return Math.max(0, env.BestHeight - height + 1);
  }
}

/**
 * Transform an UTXO to PSBT Input format
 */
export function utxoToInput(
  utxo: UTXO,
  extraData: {
    pubkey: string;
  }
): PsbtInputExtended {
  if (utxo.codeType == AddressType.P2TR) {
    return {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.satoshi,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: toXOnly(Buffer.from(extraData.pubkey, "hex")),
    };
  } else if (utxo.codeType == AddressType.P2WPKH) {
    return {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.satoshi,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
  } else {
    logger.error({ tag: TAG, msg: "utxoToInput", utxo });
    throw new CodeError(
      "not supported address type, please switch to the taproot address or native segwit address "
    );
  }
}

export function isMatch(text: string, search: string) {
  if (!search) {
    return true;
  }
  return text.toLowerCase().includes(search.toLowerCase());
}

export function checkTick(tick: string) {
  if (config.openWhitelistTick) {
    need(!!config.whitelistTick[tick], tick_disable);
  }
}

export async function apiEventToOpEvent(item: ApiEvent, cursor: number) {
  // need(item.valid);
  const event: OpEvent = {
    cursor,
    valid: item.valid,
    height: item.height,
    from: item.from,
    to: item.to,
    inscriptionId: item.inscriptionId,
    inscriptionNumber: item.inscriptionNumber,
    op: JSON.parse(item.contentBody),
    blocktime: item.blocktime,
    txid: item.txid,
    data: item.data,
    event: item.type,
  };

  checkOpEvent(event);

  // pre handle event
  if (
    [
      EventType.approve,
      EventType.conditionalApprove,
      EventType.inscribeApprove,
      EventType.inscribeConditionalApprove,
    ].includes(event.event)
  ) {
    need(!!item.data);
  }

  // pre handle op
  if (event.op.op == OpType.approve) {
    await decimal.trySetting(event.op.tick);
  } else if (event.op.op == OpType.commit) {
    //
    for (let i = 0; i < event.op.data.length; i++) {
      const item = event.op.data[i];
      if (item.func == FuncType.deployPool) {
        const [tick0, tick1] = item.params;
        await decimal.trySetting(tick0);
        await decimal.trySetting(tick1);
      }
    }
  } else if (event.op.op == OpType.deploy) {
    need(!!event.op.init.sequencer);
    need(!!event.op.init.fee_to);
    need(!!event.op.init.gas_to);
    need(!!event.op.init.gas_tick);
    env.ContractConfig = {
      swapFeeRate1000: event.op.init.swap_fee_rate
        ? decimalCal([event.op.init.swap_fee_rate, "mul", 1000])
        : "0",
      feeTo: event.op.init.fee_to,
    };
    for (let i = 0; i < config.initTicks.length; i++) {
      await decimal.trySetting(config.initTicks[i]);
    }
    // await decimal.trySetting("sats");
    // await decimal.trySetting("ordi");
    await decimal.trySetting(event.op.init.gas_tick);
  } else if (event.op.op == OpType.transfer) {
    await decimal.trySetting(event.op.tick);
  } else if (event.op.op == OpType.withdraw) {
    await decimal.trySetting(event.op.tick);
  }

  // fix tick
  if ((event.op as any).tick) {
    (event.op as any).tick = decimal.getRealTick((event.op as any).tick);
  }

  return event;
}

export async function checkDepositLimitTime(address: string, tick: string) {
  const res = await depositDao.find(
    {
      address,
      tick,
    },
    { sort: { ts: -1 } }
  );
  if (res[0]) {
    const item = res[0];
    need(Date.now() / 1000 - item.ts >= 300, deposit_delay_swap);
  }
}

export async function checkAccess(address: string) {
  if (config.onlyUserWhiteList) {
    need(config.userWhiteList.includes(address), access_denied);
  }
}

export function isFreeFeeAddr(address: string) {
  for (const pid in stakePoolMgr.poolMap) {
    const wallet = stakePoolMgr.poolMap[pid].wallet;
    if (wallet?.address == address) {
      return true;
    }
  }
  if (config.keyring.fbClaimWallet.address == address) {
    return true;
  }
  return false;
}

export function filterDustUTXO(utxos: UTXO[]) {
  const ret: UTXO[] = [];
  for (let i = 0; i < utxos.length; i++) {
    const item = utxos[i];
    if (item.height == UNCONFIRM_HEIGHT && item.satoshi < 1000) {
    } else {
      ret.push(item);
    }
  }
  return ret;
}

export function filterUnconfirmedUTXO(utxos: UTXO[]) {
  const ret: UTXO[] = [];
  for (let i = 0; i < utxos.length; i++) {
    const item = utxos[i];
    if (item.height == UNCONFIRM_HEIGHT) {
    } else {
      ret.push(item);
    }
  }
  return ret;
}

export function fixTickCaseSensitive(param: {
  tick?: string;
  tick0?: string;
  tick1?: string;
  tickIn?: string;
  tickOut?: string;
}) {
  if (param.tick) {
    param.tick = decimal.getRealTick(param.tick);
  }
  if (param.tick0) {
    param.tick0 = decimal.getRealTick(param.tick0);
  }
  if (param.tick1) {
    param.tick1 = decimal.getRealTick(param.tick1);
  }
  if (param.tickIn) {
    param.tickIn = decimal.getRealTick(param.tickIn);
  }
  if (param.tickOut) {
    param.tickOut = decimal.getRealTick(param.tickOut);
  }
}

export function cloneSnapshot(snapshot: SnapshotObj) {
  const ret: SnapshotObj = {
    assets: {
      swap: {},
      pendingSwap: {},
      available: {},
      pendingAvailable: {},
      approve: {},
      conditionalApprove: {},
      lock: {},
    },
    contractStatus: {
      kLast: {},
    },
    lpReward: _.cloneDeep(snapshot.lpReward),
    used: false,
  };
  for (const assetType in snapshot.assets) {
    for (const tick in snapshot.assets[assetType]) {
      const item = snapshot.assets[assetType][tick];
      ret.assets[assetType][tick] = new Brc20(
        _.cloneDeep(item.balance),
        tick,
        item.Supply,
        assetType
      );
    }
  }
  for (const tick in snapshot.contractStatus.kLast) {
    ret.contractStatus.kLast[tick] = snapshot.contractStatus.kLast[tick];
  }
  return ret;
}

export async function getSnapshotObjFromDao() {
  const assetRes = await snapshotAssetDao.find({});
  const klastRes = await snapshotKLastDao.find({});
  const supplyRes = await snapshotSupplyDao.find({});
  const lpRewardPoolRes = await snapshotLpRewardPoolDao.find({});
  const lpRewardUserRes = await snapshotLpRewardUserDao.find({});
  const supplyMap = {
    swap: {},
    pendingSwap: {},
    available: {},
    pendingAvailable: {},
    approve: {},
    conditionalApprove: {},
    lock: {},
  };
  for (let i = 0; i < supplyRes.length; i++) {
    const item = supplyRes[i];
    supplyMap[item.assetType][item.tick] = item.supply;
  }

  const snapshot: SnapshotObj = {
    assets: {
      swap: {},
      pendingSwap: {},
      available: {},
      pendingAvailable: {},
      approve: {},
      conditionalApprove: {},
      lock: {},
    },
    contractStatus: {
      kLast: {},
    },
    lpReward: {
      poolMap: {},
      userMap: {},
    },
    used: false,
  };
  for (let i = 0; i < assetRes.length; i++) {
    const item = assetRes[i];
    if (!snapshot.assets[item.assetType][item.tick]) {
      snapshot.assets[item.assetType][item.tick] = new Brc20(
        {},
        item.tick,
        supplyMap[item.assetType][item.tick],
        item.assetType
      );
    }
    snapshot.assets[item.assetType][item.tick].balance[item.address] =
      item.balance;
  }
  for (let i = 0; i < klastRes.length; i++) {
    const item = klastRes[i];
    snapshot.contractStatus.kLast[item.tick] = item.value;
  }
  for (let i = 0; i < lpRewardPoolRes.length; i++) {
    const item = lpRewardPoolRes[i];
    snapshot.lpReward.poolMap[item.pair] = item;
  }
  for (let i = 0; i < lpRewardUserRes.length; i++) {
    const item = lpRewardUserRes[i];
    if (!snapshot.lpReward.userMap[item.pair]) {
      snapshot.lpReward.userMap[item.pair] = {};
    }
    snapshot.lpReward.userMap[item.pair][item.address] = item;
  }
  return snapshot;
}

export async function getSatsPrice() {
  if (global.isFractal) {
    // fb_sats / brc20_sats
    const satsPrice = decimalCal(
      [env.Brc20SatsPrice, "div", env.FbSatsPrice],
      "18"
    );
    return satsPrice;
  } else {
    const satsPrice = decimalCal(
      [env.Brc20SatsPrice, "div", env.BtcSatsPrice],
      "18"
    );
    return satsPrice;
  }
}

export function satsToBtc(sats: number) {
  return sats / 100000000;
}

export function l1ToL2TickName(l1Tick: string) {
  for (let i = 0; i < env.assetList.length; i++) {
    const item = env.assetList[i];
    if (item.l1Tick == l1Tick) {
      return item.l2Tick;
    }
  }
  return l1Tick;
  // throw new Error("can not bridge: " + l1Tick);
}

export function l2ToL1TickName(l2Tick: string) {
  for (let i = 0; i < env.assetList.length; i++) {
    const item = env.assetList[i];
    if (item.l2Tick == l2Tick) {
      return item.l1Tick;
    }
  }
  return l2Tick;
  // throw new Error("can not bridge: " + l2Tick);
}

export function getL1NetworkType(tick: string) {
  for (let i = 0; i < env.assetList.length; i++) {
    const item = env.assetList[i];
    if (item.l1Tick == tick || item.l2Tick == tick) {
      return item.l1NetworkType;
    }
  }
  return process.env.BITCOIN_NETWORK as NetworkType;
}

export function getL1AssetType(tick: string) {
  for (let i = 0; i < env.assetList.length; i++) {
    const item = env.assetList[i];
    if (item.l1Tick == tick || item.l2Tick == tick) {
      return item.l1AssetType;
    }
  }
  return null;
}

export function getPoolLp(space: Space, pair: string) {
  const assets = space.Assets;
  const { tick0, tick1 } = getPairStructV2(pair);
  const poolLp = uintCal([
    assets.getSwapSupply(pair),
    "add",
    space.Contract.getFeeLp({ tick0, tick1 }), // LP are only minted when adding/removing liquidity, and this portion needs to be pre-accounted for.
  ]);
  return poolLp;
}

export async function getLpInfo(params: {
  tick0: string;
  tick1: string;
  lp: string;
}): Promise<{
  amount0: string;
  amount1: string;
  value: number;
}> {
  const { tick0, tick1, lp } = params;
  if (parseFloat(lp) <= 0) {
    return { value: 0, amount0: "0", amount1: "0" };
  }

  const res = await operator.quoteRemoveLiq({
    address: "",
    tick0,
    tick1,
    lp,
  });

  const tick0Price = await query.getTickPrice(tick0);
  const tick1Price = await query.getTickPrice(tick1);

  const value0 = decimalCal(
    [res.amount0, "mul", tick0Price],
    decimal.get(tick0)
  );
  const value1 = decimalCal(
    [res.amount1, "mul", tick1Price],
    decimal.get(tick1)
  );
  let value = parseFloat(decimalCal([value0, "add", value1], "18"));

  logger.debug({
    tag: TAG,
    msg: "quoteLpValue",
    tick0,
    tick1,
    lp,
    amount0: res.amount0,
    amount1: res.amount1,
    tick0Price,
    tick1Price,
    value0,
    value1,
    value,
  });

  if (config.lpExceptionValue && value > config.lpExceptionValue) {
    if (QUOTA_ASSETS.includes(tick0) || QUOTA_ASSETS.includes(tick1)) {
      logger.error({
        tag: TAG,
        msg: "quoteLpValue error",
        tick0,
        tick1,
        lp,
        amount0: res.amount0,
        amount1: res.amount1,
        tick0Price,
        tick1Price,
        value0,
        value1,
        value,
      });
    } else {
      value = 0;
    }
  }

  return {
    amount0: res.amount0,
    amount1: res.amount1,
    value,
  };
}

export function batchReqToReqs(req: BatchFuncReq): FuncReq[] {
  const reqs: FuncReq[] = [];
  for (let i = 0; i < req.req.to.length; i++) {
    const item = req.req.to[i];

    // Construct the base request object, excluding the amountList.
    const baseReq = {
      address: req.req.address,
      tick: req.req.tick,
      feeTick: req.req.feeTick,
      feeTickPrice: req.req.feeTickPrice,
      ts: req.req.ts,
      payType: req.req.payType,
      rememberPayType: req.req.rememberPayType,
      checkBalance: req.req.checkBalance,
      sigs: req.req.sigs,
    };

    if (i == req.req.to.length - 1) {
      const funcReq: FuncReq = {
        func: req.func,
        req: {
          ...baseReq,
          to: item,
          amount: req.req.amountList ? req.req.amountList[i] : req.req.amount,
          feeAmount: req.req.feeAmount,
        },
      };
      checkFuncReq(funcReq);
      reqs.push(funcReq);
    } else {
      const funcReq: FuncReq = {
        func: req.func,
        req: {
          ...baseReq,
          to: item,
          amount: req.req.amountList ? req.req.amountList[i] : req.req.amount,
          feeAmount: "0", // no fee for batch
        },
      };
      checkFuncReq(funcReq);
      reqs.push(funcReq);
    }
  }
  return reqs;
}
export const verifyMessage = (
  address: string,
  publicKey: string,
  text: string,
  sig: string
) => {
  const message = new bitcore.Message(text);

  let signature = bitcore.crypto.Signature.fromCompact(
    Buffer.from(sig, "base64")
  );
  let hash = message.magicHash();

  // recover the public key
  let ecdsa = new bitcore.crypto.ECDSA();
  ecdsa.hashbuf = hash;
  ecdsa.sig = signature;

  const pubkeyInSig = ecdsa.toPublicKey();

  const pubkeyInSigString = new bitcore.PublicKey(
    Object.assign({}, pubkeyInSig.toObject(), { compressed: true })
  ).toString();
  if (pubkeyInSigString != publicKey) {
    throw new Error("publicKey error");
  }

  const success = bitcore.crypto.ECDSA.verify(hash, signature, pubkeyInSig);
  if (!success) {
    throw new Error("sign error");
  }
  return true;
};
