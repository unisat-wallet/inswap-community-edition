import { Assets } from "../../../src/contract/assets";
import { bn, bnDecimal, bnUint, decimalCal } from "../../../src/contract/bn";
import {
  getPairStrV2,
  getPairStructV2,
  need,
  sortTickParams,
} from "../../../src/contract/contract-utils";
import { LP_DECIMAL } from "../../../src/domain/constant";
import { EventType, InscriptionEventsRes } from "../../../src/types/api";
import { FuncMsg, OridinalMsg, Pair } from "../../../src/types/domain";
import {
  AddLiqParams,
  ContractResult,
  DecreaseApprovalParams,
  DeployPoolParams,
  ExactType,
  FuncType,
  InscriptionFunc,
  InternalFunc,
  RemoveLiqParams,
  Result,
  SendParams,
  SwapParams,
} from "../../../src/types/func";
import {
  ApproveOp,
  CommitOp,
  ConditionalApproveOp,
  ModuleOp,
  OpEvent,
  OpType,
} from "../../../src/types/op";
// import { Contract } from "../../contract";
import BigNumber from "bignumber.js";
import { Brc20 } from "../../../src/contract/brc20";
import { Contract } from "../../../src/contract/contract";
import {
  convertFuncInscription2Internal,
  convertFuncInternal2Inscription,
} from "../../../src/domain/convert-struct";
import { Decimal } from "../../../src/domain/decimal";
// import { Decimal } from "./decimal";

const updateHeight1 = 1;

export class ContractValidator {
  private contract: Contract;
  private decimal: Decimal;
  private moduleInitParams: ModuleOp["init"];
  private gas_to: string;

  public results: any[] = [];

  static fromJSONString(str: string) {
    const validator = new ContractValidator();
    const data = JSON.parse(str);

    const assetsMap = data.contract.assets.map;
    for (let assetType in assetsMap) {
      for (let tick in assetsMap[assetType]) {
        const brc20Data = assetsMap[assetType][tick];
        const brc20 = new Brc20(
          brc20Data.balance,
          tick,
          brc20Data.supply,
          assetType
        );
        assetsMap[assetType][tick] = brc20;
      }
    }

    validator.contract = new Contract(
      new Assets(assetsMap),
      data.contract.status,
      data.contract.config
    );

    validator.decimal = Decimal.fromData(data.decimal);
    validator.moduleInitParams = data.moduleInitParams;
    validator.gas_to = data.gas_to;

    return validator;
  }

  get Contract() {
    return this.contract;
  }

  private to1000(amount: string) {
    return (parseInt(amount) * 1000).toString();
  }

  private getFuncInternalLength(func: InscriptionFunc) {
    return Buffer.from(JSON.stringify(func)).length;
  }

  private getPairStruct(pair: string): Pair {
    const tick0 = Buffer.from(pair).subarray(0, 4).toString();
    const tick1 = Buffer.from(pair).subarray(5).toString();
    need(sortTickParams({ tick0, tick1 }).tick0 == tick0);
    return { tick0, tick1 };
  }

  private convertFuncInscription2Internal(
    index: number,
    op: CommitOp,
    height: number
  ): InternalFunc {
    const target = op.data[index];
    const address = target.addr;

    const datas: OridinalMsg[] = [];
    let lastData: OridinalMsg;
    let lastFunc: FuncMsg;
    for (let i = 0; i <= index; i++) {
      lastFunc = op.data[i];
      if (lastFunc.addr == address) {
        lastData = {
          module: op.module,
          parent: op.parent,
          gas_price: op.gas_price,
          addr: lastFunc.addr,
          func: lastFunc.func,
          params: lastFunc.params,
          ts: lastFunc.ts,
        };
        datas.push(lastData);
      }
    }

    // not care sign
    const id = "x".repeat(64);
    const prevs = [];

    if (lastFunc.func == FuncType.deployPool) {
      const params = lastFunc.params as DeployPoolParams;

      return {
        id,
        func: lastFunc.func,
        params: {
          address: lastFunc.addr,
          tick0: params[0],
          tick1: params[1],
        },
        prevs,
        ts: lastFunc.ts,
        sig: lastFunc.sig,
      };
    } else if (lastFunc.func == FuncType.addLiq) {
      const params = lastFunc.params as AddLiqParams;

      if (height < updateHeight1) {
        const pair = this.getPairStruct(params[0]);
        const decimal0 = this.decimal.get(pair.tick0);
        const decimal1 = this.decimal.get(pair.tick1);
        return {
          id,
          func: lastFunc.func,
          params: {
            address: lastFunc.addr,
            tick0: pair.tick0,
            tick1: pair.tick1,
            amount0: bnUint(params[1], decimal0),
            amount1: bnUint(params[2], decimal1),
            expect: bnUint(params[3], LP_DECIMAL),
            slippage1000: bnUint(params[4], "3"),
          },
          prevs,
          ts: lastFunc.ts,
          sig: lastFunc.sig,
        };
      } else {
        const tick0 = params[0];
        const tick1 = params[1];
        const decimal0 = this.decimal.get(tick0);
        const decimal1 = this.decimal.get(tick1);
        return {
          id,
          func: lastFunc.func,
          params: {
            address: lastFunc.addr,
            tick0,
            tick1,
            amount0: bnUint(params[2], decimal0),
            amount1: bnUint(params[3], decimal1),
            expect: bnUint(params[4], LP_DECIMAL),
            slippage1000: bnUint(params[5], "3"),
          },
          prevs,
          ts: lastFunc.ts,
          sig: lastFunc.sig,
        };
      }
    } else if (lastFunc.func == FuncType.swap) {
      const params = lastFunc.params as string[];
      if (height < updateHeight1) {
        const pair = this.getPairStruct(params[0]);
        const decimal0 = this.decimal.get(pair.tick0);
        const decimal1 = this.decimal.get(pair.tick1);
        const expectDecimal = params[1] == pair.tick0 ? decimal1 : decimal0;
        const exactType = params[3] as ExactType;
        const tick = params[1];
        const tickOther = params[1] == pair.tick0 ? pair.tick1 : pair.tick0;
        return {
          id,
          func: lastFunc.func,
          params: {
            address: lastFunc.addr,
            tickIn: exactType == ExactType.exactIn ? tick : tickOther,
            tickOut: exactType == ExactType.exactOut ? tick : tickOther,
            amount: bnUint(params[2], this.decimal.get(params[1])),
            exactType,
            expect: bnUint(params[4], expectDecimal),
            slippage1000: bnUint(params[5], "3"),
          },
          prevs,
          ts: lastFunc.ts,
          sig: lastFunc.sig,
        };
      } else {
        const tick0 = params[0];
        const tick1 = params[1];
        const decimal0 = this.decimal.get(tick0);
        const decimal1 = this.decimal.get(tick1);
        const expectDecimal = params[2] == tick0 ? decimal1 : decimal0;
        const exactType = params[4] as ExactType;
        const tick = params[2];
        const tickOther = params[2] == tick0 ? tick1 : tick0;
        return {
          id,
          func: lastFunc.func,
          params: {
            address: lastFunc.addr,
            tickIn: exactType == ExactType.exactIn ? tick : tickOther,
            tickOut: exactType == ExactType.exactOut ? tick : tickOther,
            amount: bnUint(params[3], this.decimal.get(params[0])),
            exactType,
            expect: bnUint(params[5], expectDecimal),
            slippage1000: bnUint(params[6], "3"),
          },
          prevs,
          ts: lastFunc.ts,
          sig: lastFunc.sig,
        };
      }
    } else if (lastFunc.func == FuncType.removeLiq) {
      const params = lastFunc.params as string[];
      if (height < updateHeight1) {
        const pair = this.getPairStruct(params[0]);
        const decimal0 = this.decimal.get(pair.tick0);
        const decimal1 = this.decimal.get(pair.tick1);
        return {
          id,
          func: lastFunc.func,
          params: {
            address: lastFunc.addr,
            tick0: pair.tick0,
            tick1: pair.tick1,
            lp: bnUint(params[1], LP_DECIMAL),
            amount0: bnUint(params[2], decimal0),
            amount1: bnUint(params[3], decimal1),
            slippage1000: bnUint(params[4], "3"),
          },
          prevs,
          ts: lastFunc.ts,
          sig: lastFunc.sig,
        };
      } else {
        const tick0 = params[0];
        const tick1 = params[1];
        const decimal0 = this.decimal.get(tick0);
        const decimal1 = this.decimal.get(tick1);
        return {
          id,
          func: lastFunc.func,
          params: {
            address: lastFunc.addr,
            tick0,
            tick1,
            lp: bnUint(params[2], LP_DECIMAL),
            amount0: bnUint(params[3], decimal0),
            amount1: bnUint(params[4], decimal1),
            slippage1000: bnUint(params[5], "3"),
          },
          prevs,
          ts: lastFunc.ts,
          sig: lastFunc.sig,
        };
      }
    } else if (lastFunc.func == FuncType.decreaseApproval) {
      const params = lastFunc.params as DecreaseApprovalParams;
      const tick = params[0];
      const amount = params[1];
      return {
        id,
        func: lastFunc.func,
        params: {
          address: lastFunc.addr,
          tick,
          amount: bnUint(amount, this.decimal.get(tick)),
        },
        prevs,
        ts: lastFunc.ts,
        sig: lastFunc.sig,
      };
    } else if (lastFunc.func == FuncType.send) {
      const params = lastFunc.params as SendParams;
      const tick = params[1];
      const amount = params[2];
      return {
        id,
        func: lastFunc.func,
        params: {
          address: lastFunc.addr,
          from: lastFunc.addr,
          to: params[0],
          tick,
          amount: bnUint(amount, this.decimal.get(tick)),
        },
        prevs,
        ts: lastFunc.ts,
        sig: lastFunc.sig,
      };
    } else if (lastFunc.func == FuncType.sendLp) {
      const params = lastFunc.params as SendParams;
      const tick = params[1];
      const amount = params[2];
      return {
        id,
        func: lastFunc.func,
        params: {
          address: lastFunc.addr,
          from: lastFunc.addr,
          to: params[0],
          tick,
          amount: bnUint(amount, this.decimal.get(tick)),
        },
        prevs,
        ts: lastFunc.ts,
        sig: lastFunc.sig,
      };
    }
  }

  private convertFuncInternal2Inscription(
    func: InternalFunc,
    height: number
  ): InscriptionFunc {
    if (func.func == FuncType.deployPool) {
      const params = sortTickParams(func.params);
      return {
        id: func.id,
        func: func.func,
        params: [params.tick0, params.tick1] as DeployPoolParams,
        addr: params.address,
        ts: func.ts,
        sig: func.sig,
      };
    } else if (func.func == FuncType.addLiq) {
      const params = sortTickParams(func.params);
      return {
        id: func.id,
        func: func.func,
        params: [
          getPairStrV2(params.tick0, params.tick1),
          bnDecimal(params.amount0, this.decimal.get(params.tick0)),
          bnDecimal(params.amount1, this.decimal.get(params.tick1)),
          bnDecimal(params.expect, LP_DECIMAL),
          bnDecimal(params.slippage1000, "3"),
        ] as AddLiqParams,
        addr: params.address,
        ts: func.ts,
        sig: func.sig,
      };
    } else if (func.func == FuncType.swap) {
      const params = func.params;
      const expectDecimal =
        params.exactType == ExactType.exactIn
          ? this.decimal.get(params.tickOut)
          : this.decimal.get(params.tickIn);
      const tick =
        params.exactType == ExactType.exactIn ? params.tickIn : params.tickOut;
      return {
        id: func.id,
        func: func.func,
        params: [
          getPairStrV2(params.tickIn, params.tickOut),
          tick,
          bnDecimal(params.amount, this.decimal.get(tick)),
          params.exactType,
          bnDecimal(params.expect, expectDecimal),
          bnDecimal(params.slippage1000, "3"),
        ] as SwapParams,
        addr: params.address,
        ts: func.ts,
        sig: func.sig,
      };
    } else if (func.func == FuncType.removeLiq) {
      const params = sortTickParams(func.params);
      return {
        id: func.id,
        func: func.func,
        params: [
          getPairStrV2(params.tick0, params.tick1),
          bnDecimal(params.lp, LP_DECIMAL),
          bnDecimal(params.amount0, this.decimal.get(params.tick0)),
          bnDecimal(params.amount1, this.decimal.get(params.tick1)),
          bnDecimal(params.slippage1000, "3"),
        ] as RemoveLiqParams,
        addr: params.address,
        ts: func.ts,
        sig: func.sig,
      };
    } else if (func.func == FuncType.decreaseApproval) {
      const params = func.params;
      return {
        id: func.id,
        func: func.func,
        params: [
          params.tick,
          bnDecimal(params.amount, this.decimal.get(params.tick)),
        ] as DecreaseApprovalParams,
        addr: params.address,
        ts: func.ts,
        sig: func.sig,
      };
    }
  }

  calculateServerFee(gasPrice: string, funcLength: number) {
    return decimalCal(
      [gasPrice, "mul", funcLength],
      this.decimal.get(this.moduleInitParams.gas_tick)
    );
  }

  constructor() {}

  handleEvents(eventsData: InscriptionEventsRes, decimalData) {
    global.decimal = new Decimal();
    for (var id in decimalData) {
      global.decimal.set(id, decimalData[id]);
    }
    this.decimal = decimal;
    for (let i = 0; i < eventsData.detail.length; i++) {
      const item = eventsData.detail[i];
      if (!item.valid) {
        continue;
      }

      const event: OpEvent = {
        cursor: i,
        valid: true,
        event: item.type,
        height: item.height,
        from: item.from,
        to: item.to,
        inscriptionId: item.inscriptionId,
        inscriptionNumber: item.inscriptionNumber,
        op: JSON.parse(item.contentBody),
        blocktime: item.blocktime,
        txid: item.txid,
        data: item.data,
      };

      if ((event.op as any).tick) {
        (event.op as any).tick = this.decimal.getRealTick(
          (event.op as any).tick
        );
      }

      if (event.op.op == OpType.deploy) {
        need(!!event.op.init.sequencer);
        need(!!event.op.init.fee_to);
        need(!!event.op.init.gas_to);
        need(!!event.op.init.gas_tick);

        this.moduleInitParams = event.op.init;
        this.gas_to = event.op.init.gas_to;
        this.contract = new Contract(
          new Assets({
            swap: {},
            pendingSwap: {},
            available: {},
            pendingAvailable: {},
            approve: {},
            conditionalApprove: {},
            lock: {},
          }),
          {
            kLast: {},
          },
          {
            feeTo: this.moduleInitParams.fee_to,
            swapFeeRate1000: event.op.init.swap_fee_rate
              ? decimalCal([event.op.init.swap_fee_rate, "mul", 1000])
              : "0",
          }
        );
      } else if (event.op.op == OpType.transfer) {
        this.contract.assets.mint(
          event.from,
          event.op.tick,
          bnUint(event.op.amt, this.decimal.get(event.op.tick)),
          "swap"
        );
      } else if (event.op.op == OpType.commit) {
        for (let j = 0; j < event.op.data.length; j++) {
          try {
            const func = convertFuncInscription2Internal(
              j,
              event.op,
              event.height
            );
            this.aggregate(
              func,
              event.op.gas_price,
              event.inscriptionId,
              j,
              event.height
            );
          } catch (err) {
            console.log(event.op.data[j]);
            console.log(
              "func error: ",
              err.message,
              "\nsubsequent signatures with the same address will be invalid.\n"
            );
            throw err;
          }
        }
      } else if (event.event == EventType.approve) {
        const op = event.op as ApproveOp;
        const amountInt = bnUint(event.data.amount, this.decimal.get(op.tick));
        // this.contract.assets.burn(event.from, op.tick, amountInt, "approve");
        this.contract.assets.mint(event.to, op.tick, amountInt, "swap");
      } else if (event.event == EventType.conditionalApprove) {
        const op = event.op as ConditionalApproveOp;
        if (bn(event.data.amount).gt("0")) {
          const amountInt = bnUint(
            event.data.amount,
            this.decimal.get(op.tick)
          );
          // this.contract.assets.burn(event.from, op.tick, amountInt, "conditionalApprove");
          this.contract.assets.mint(event.to, op.tick, amountInt, "swap");
        }
      }
    }
  }

  aggregate(
    func: InternalFunc,
    gasPrice: string,
    commit: string,
    index: number,
    height: number
  ) {
    let funcLength: number;
    if (height < updateHeight1) {
      funcLength = this.getFuncInternalLength(
        convertFuncInternal2Inscription(func, height)
      );
    } else {
      funcLength = 1;
    }
    const gasTick = this.moduleInitParams.gas_tick;
    const amount = this.calculateServerFee(gasPrice, funcLength);
    const sendParams = {
      address: func.params.address,
      from: func.params.address,
      to: this.gas_to,
      amount: bnUint(amount, this.decimal.get(gasTick)),
      tick: gasTick,
    };

    // fee
    if (BigNumber(gasPrice).gt(0)) {
      this.contract.send(sendParams);
    }

    let out: ContractResult["out"];
    if (func.func == FuncType.deployPool) {
      out = this.contract.deployPool(func.params);
      this.contract.assets.tryCreate(func.params.tick0);
      this.contract.assets.tryCreate(func.params.tick1);
    } else if (func.func == FuncType.addLiq) {
      out = this.contract.addLiq(func.params);
    } else if (func.func == FuncType.swap) {
      out = this.contract.swap(func.params, undefined);
    } else if (func.func == FuncType.removeLiq) {
      out = this.contract.removeLiq(func.params);
    } else if (func.func == FuncType.send) {
      out = this.contract.send(func.params);
    } else if (func.func == FuncType.decreaseApproval) {
      const { address, tick, amount } = func.params;
      this.contract.assets.convert(
        address,
        tick,
        amount,
        "swap",
        "pendingAvailable"
      );
      out = { id: func.id };
    }

    // this.results.push(this.genResult({ commit, function: index }));
  }

  isLp(tick: string) {
    try {
      const pair = getPairStructV2(tick);
      return getPairStrV2(pair.tick0, pair.tick1) == tick;
    } catch (err) {
      return false;
    }
  }

  genResult(params?: { commit: string; function: number }) {
    const assets = this.contract.assets;
    const map = this.contract.assets.dataRefer();
    const data: Result = {
      users: [],
      pools: [],
    };
    for (let tick in map["swap"]) {
      const brc20 = map["swap"][tick];

      if (this.isLp(tick)) {
        const pair = tick;
        const { tick0, tick1 } = getPairStructV2(pair);

        let reserve1 = "0";
        let reserve0 = "0";
        try {
          reserve0 = bnDecimal(
            assets.get(tick0).balanceOf(pair),
            this.decimal.get(tick0)
          );
        } catch (err) {}

        try {
          reserve1 = bnDecimal(
            assets.get(tick1).balanceOf(pair),
            this.decimal.get(tick1)
          );
        } catch (err) {}

        data.pools.push({
          pair: tick,
          reserve0,
          reserve1,
          lp: bnDecimal(assets.get(pair).Supply, LP_DECIMAL),
        });
      }

      if (!brc20.balance["0"]) {
        data.users.push({
          address: "0",
          tick,
          balance: "0",
        });
      }

      for (let key in brc20.balance) {
        if (!this.isLp(key)) {
          const address = key;
          data.users.push({
            address,
            tick,
            balance: !this.isLp(tick)
              ? bnDecimal(
                  assets.get(tick).balanceOf(address),
                  this.decimal.get(tick)
                )
              : bnDecimal(assets.get(tick).balanceOf(address), "18"),
          });
        }
      }
    }
    if (params) {
      data["commit"] = params.commit;
      data["function"] = params.function;
    }

    data.users?.sort((a, b) => {
      if (a.tick < b.tick) {
        return -1;
      }
      if (a.tick > b.tick) {
        return 1;
      }
      if (a.address < b.address) {
        return -1;
      }
      if (a.address > b.address) {
        return 1;
      }
      return 0;
    });
    data.pools?.sort((a, b) => {
      if (a.pair < b.pair) {
        return 1;
      } else if (a.pair > b.pair) {
        return -1;
      } else {
        return 0;
      }
    });
    return data;
  }

  verify(expectResult) {
    return JSON.stringify(this.genResult()) == JSON.stringify(expectResult);
  }
}
