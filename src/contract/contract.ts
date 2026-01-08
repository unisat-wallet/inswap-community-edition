import { ContractConfig, ContractStatus } from "../types/domain";
import {
  AddLiqIn,
  AddLiqOut,
  AmountInputIn,
  AmountOutputIn,
  DeployPoolIn,
  DeployPoolOut,
  ExactType,
  MintFeeIn,
  RemoveLiqIn,
  RemoveLiqOut,
  SendIn,
  SendOut,
  SwapIn,
  SwapOut,
} from "../types/func";
import { Assets } from "./assets";
import { bn, uintCal } from "./bn";
import {
  checkGtZero,
  checkGteZero,
  checkSlippage,
  getPairStrV2,
  need,
  sortTickParams,
} from "./contract-utils";
import { Observer } from "./observer";

export const exceeding_slippage = "exceeding slippage";
export const duplicate_tick = "duplicate tick";
export const insufficient_liquidity = "insufficient liquidity for this trade";
export const pool_existed = "pool existed";
export const pool_not_found = "pool not found";

const feeOn = true;
const feeRate = "6";

export const AssetsClass = Assets;
export type NotifyKlastData = {
  tick: string;
  address: string;
  k: string;
};

export class Contract {
  readonly assets: Assets;
  readonly status: ContractStatus;
  readonly config: ContractConfig;

  private observer: Observer;
  setObserver(observer: Observer) {
    this.observer = observer;
  }

  constructor(assets: Assets, status: ContractStatus, config: ContractConfig) {
    this.assets = assets;
    this.status = status;
    this.config = config;
  }

  public deployPool(params: DeployPoolIn): DeployPoolOut {
    need(params.tick0 !== params.tick1, duplicate_tick);

    const pair = getPairStrV2(params.tick0, params.tick1);
    need(!this.assets.isExist(pair), pool_existed);

    this.assets.tryCreate(pair);
    return {};
  }

  public addLiq(params: AddLiqIn): AddLiqOut {
    const { tick0, tick1, amount0, amount1, expect, slippage1000 } =
      sortTickParams(params);

    checkGtZero(amount0);
    checkGtZero(amount1);
    checkGteZero(expect);
    checkSlippage(slippage1000);

    const pair = getPairStrV2(tick0, tick1);
    const { address } = params;
    need(!!this.assets.isExist(pair), pool_not_found);

    this.mintFee({
      tick0,
      tick1,
    });

    if (this.assets.getSwapSupply(pair) == "0") {
      const lp = uintCal([amount0, "mul", amount1, "sqrt"]);

      // ensure there is always liquidity in the pool
      const firstLP = uintCal([lp, "sub", "1000"]);

      this.assets.get(pair).mint(address, firstLP);
      this.assets.get(pair).mint("0", "1000");
      this.assets.get(tick0).transfer(address, pair, amount0);
      this.assets.get(tick1).transfer(address, pair, amount1);

      checkGtZero(firstLP);
      need(
        bn(firstLP).gte(
          uintCal([
            expect,
            "mul",
            uintCal(["1000", "sub", slippage1000]),
            "div",
            "1000",
          ])
        ),
        exceeding_slippage
      );

      if (feeOn) {
        this.status.kLast[pair] = uintCal([
          this.assets.get(tick0).balanceOf(pair),
          "mul",
          this.assets.get(tick1).balanceOf(pair),
        ]);
        if (this.observer) {
          this.observer.notify<NotifyKlastData>("klast", {
            tick: pair,
            k: this.status.kLast[pair],
            address: params.address,
          });
        }
      }

      return { lp: firstLP, amount0, amount1 };
    } else {
      let amount0Adjust: string;
      let amount1Adjust: string;

      const poolLp = this.assets.getSwapSupply(pair);
      const poolAmount0 = this.assets.get(tick0).balanceOf(pair);
      const poolAmount1 = this.assets.get(tick1).balanceOf(pair);

      amount1Adjust = uintCal([
        amount0,
        "mul",
        poolAmount1,
        "div",
        poolAmount0,
      ]);
      if (bn(amount1Adjust).lte(amount1)) {
        amount0Adjust = amount0;
      } else {
        amount0Adjust = uintCal([
          amount1,
          "mul",
          poolAmount0,
          "div",
          poolAmount1,
        ]);
        amount1Adjust = amount1;
      }

      const lp0 = uintCal([amount0Adjust, "mul", poolLp, "div", poolAmount0]);
      const lp1 = uintCal([amount1Adjust, "mul", poolLp, "div", poolAmount1]);
      const lp = bn(lp0).lt(lp1) ? lp0 : lp1;

      this.assets.get(pair).mint(address, lp);
      this.assets.get(tick0).transfer(address, pair, amount0Adjust);
      this.assets.get(tick1).transfer(address, pair, amount1Adjust);

      checkGtZero(lp);
      need(
        bn(lp).gte(
          uintCal([
            expect,
            "mul",
            uintCal(["1000", "sub", slippage1000]),
            "div",
            "1000",
          ])
        ),
        exceeding_slippage
      );
      need(amount1Adjust == amount1 || amount0Adjust == amount0);

      if (feeOn) {
        this.status.kLast[pair] = uintCal([
          this.assets.get(tick0).balanceOf(pair),
          "mul",
          this.assets.get(tick1).balanceOf(pair),
        ]);
        if (this.observer) {
          this.observer.notify<NotifyKlastData>("klast", {
            tick: pair,
            k: this.status.kLast[pair],
            address: params.address,
          });
        }
      }

      return { lp, amount0: amount0Adjust, amount1: amount1Adjust };
    }
  }

  public removeLiq(params: RemoveLiqIn): RemoveLiqOut {
    const { address, lp, tick0, tick1, amount0, amount1, slippage1000 } =
      sortTickParams(params);

    checkGtZero(lp);
    checkGteZero(amount0);
    checkGteZero(amount1);
    checkSlippage(slippage1000);

    this.mintFee({
      tick0,
      tick1,
    });

    const pair = getPairStrV2(tick0, tick1);
    need(!!this.assets.isExist(pair), pool_not_found);

    const poolLp = this.assets.getSwapSupply(pair);
    const reserve0 = this.assets.get(tick0).balanceOf(pair);
    const reserve1 = this.assets.get(tick1).balanceOf(pair);
    const acquire0 = uintCal([lp, "mul", reserve0, "div", poolLp]);
    const acquire1 = uintCal([lp, "mul", reserve1, "div", poolLp]);

    this.assets.get(pair).burn(address, lp);
    this.assets.get(tick0).transfer(pair, address, acquire0);
    this.assets.get(tick1).transfer(pair, address, acquire1);

    need(
      bn(acquire0).gte(
        uintCal([
          amount0,
          "mul",
          uintCal(["1000", "sub", slippage1000]),
          "div",
          "1000",
        ])
      ),
      exceeding_slippage
    );
    need(
      bn(acquire1).gte(
        uintCal([
          amount1,
          "mul",
          uintCal(["1000", "sub", slippage1000]),
          "div",
          "1000",
        ])
      ),
      exceeding_slippage
    );

    if (feeOn) {
      this.status.kLast[pair] = uintCal([
        this.assets.get(tick0).balanceOf(pair),
        "mul",
        this.assets.get(tick1).balanceOf(pair),
      ]);
      if (this.observer) {
        this.observer.notify<NotifyKlastData>("klast", {
          tick: pair,
          k: this.status.kLast[pair],
          address: params.address,
        });
      }
    }

    return { tick0, tick1, amount0: acquire0, amount1: acquire1 };
  }

  public swap(params: SwapIn, swapFeeRate1000: string): SwapOut {
    const {
      tickIn,
      tickOut,
      address,
      exactType,
      expect,
      slippage1000,
      amount,
    } = params;

    checkGtZero(amount);
    checkGteZero(expect);
    checkSlippage(slippage1000);

    const pair = getPairStrV2(tickIn, tickOut);
    const reserveIn = this.assets.get(tickIn).balanceOf(pair);
    const reserveOut = this.assets.get(tickOut).balanceOf(pair);

    let amountIn: string;
    let amountOut: string;
    let ret: string;

    if (exactType == ExactType.exactIn) {
      amountIn = amount;
      amountOut = this.getAmountOut(
        {
          amountIn,
          reserveIn,
          reserveOut,
        },
        swapFeeRate1000
      );

      const amountOutMin = uintCal([
        expect,
        "mul",
        "1000",
        "div",
        uintCal(["1000", "add", slippage1000]),
      ]);
      need(bn(amountOut).gte(amountOutMin), exceeding_slippage);

      ret = amountOut;
    } else {
      amountOut = amount;
      amountIn = this.getAmountIn(
        {
          amountOut,
          reserveIn,
          reserveOut,
        },
        swapFeeRate1000
      );

      const amountInMax = uintCal([
        expect,
        "mul",
        uintCal(["1000", "add", slippage1000]),
        "div",
        "1000",
      ]);
      need(bn(amountIn).lte(amountInMax), exceeding_slippage);

      ret = amountIn;
    }

    this.assets.swap(address, tickIn, tickOut, amountIn, amountOut);

    return { amount: ret };
  }

  getAmountOut(params: AmountInputIn, swapFeeRate1000: string) {
    const { amountIn, reserveIn, reserveOut } = params;
    checkGtZero(amountIn);
    need(
      bn(reserveIn).gt("0") && bn(reserveOut).gt("0"),
      insufficient_liquidity
    );
    const amountInWithFee = uintCal([
      amountIn,
      "mul",
      uintCal(["1000", "sub", swapFeeRate1000 || this.config.swapFeeRate1000]),
    ]);
    const numerator = uintCal([amountInWithFee, "mul", reserveOut]);
    const denominator = uintCal([
      reserveIn,
      "mul",
      "1000",
      "add",
      amountInWithFee,
    ]);
    return uintCal([numerator, "div", denominator]);
  }

  getAmountIn(params: AmountOutputIn, swapFeeRate1000: string) {
    const { amountOut, reserveIn, reserveOut } = params;
    checkGtZero(amountOut);
    need(
      bn(reserveIn).gt("0") && bn(reserveOut).gt("0"),
      insufficient_liquidity
    );

    const numerator = uintCal([reserveIn, "mul", amountOut, "mul", "1000"]);
    const denominator = uintCal([
      reserveOut,
      "sub",
      amountOut,
      "mul",
      uintCal(["1000", "sub", swapFeeRate1000 || this.config.swapFeeRate1000]),
    ]);
    return uintCal([numerator, "div", denominator, "add", "1"]);
  }

  public send(params: SendIn): SendOut {
    const { from, to, tick, amount } = params;
    checkGtZero(amount);
    this.assets.get(tick).transfer(from, to, amount);
    return {};
  }

  getFeeLp(params: MintFeeIn) {
    const { tick0, tick1 } = params;

    const pair = getPairStrV2(tick0, tick1);
    const reserve0 = this.assets.get(tick0).balanceOf(pair);
    const reserve1 = this.assets.get(tick1).balanceOf(pair);

    if (feeOn) {
      if (bn(this.status.kLast[pair]).gt("0")) {
        const rootK = uintCal([reserve0, "mul", reserve1, "sqrt"]);
        const rootKLast = uintCal([this.status.kLast[pair], "sqrt"]);
        if (bn(rootK).gt(rootKLast)) {
          const numerator = uintCal([
            this.assets.getSwapSupply(pair),
            "mul",
            uintCal([rootK, "sub", rootKLast]),
          ]);
          const scale = uintCal([feeRate, "sub", "1"]);
          const denominator = uintCal([rootK, "mul", scale, "add", rootKLast]);
          const liquidity = uintCal([numerator, "div", denominator]);

          return liquidity;
        }
      }
    }

    return "0";
  }

  private mintFee(params: MintFeeIn) {
    const { tick0, tick1 } = params;
    const pair = getPairStrV2(tick0, tick1);
    if (feeOn) {
      const liquidity = this.getFeeLp(params);
      if (bn(liquidity).gt("0")) {
        this.assets.get(pair).mint(this.config.feeTo, liquidity);
      }
    } else {
      this.status.kLast[pair] = "0";
    }
  }
}
