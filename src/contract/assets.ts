import { bn, uintCal } from "./bn";
import { Brc20 } from "./brc20";
import { getPairStrV2, need } from "./contract-utils";
import { Observer } from "./observer";

type AssetType =
  // swap
  | "swap"
  | "pendingSwap"
  // module
  | "available"
  | "pendingAvailable"
  | "approve"
  | "conditionalApprove"
  | "lock";

export const allAssetType = [
  "swap",
  "pendingSwap",
  "available",
  "pendingAvailable",
  "approve",
  "conditionalApprove",
  "lock",
];

export type NotifyAssetData = {
  assetType: string;
  tick: string;
  address: string;
  balance: string;
};

export class Assets {
  private map: { [assetType: string]: { [tick: string]: Brc20 } } = {};
  private observer: Observer;
  setObserver(observer: Observer) {
    this.observer = observer;
    for (const assetType in this.map) {
      for (const tick in this.map[assetType]) {
        this.map[assetType][tick].setObserver(observer);
      }
    }
  }

  constructor(map: { [assetType: string]: { [tick: string]: Brc20 } }) {
    this.map = map;
  }

  private getAvaiableAssets(address: string) {
    let set = new Set<string>();
    for (const assetType in this.map) {
      for (const tick in this.map[assetType]) {
        if (
          bn(this.getBalance(address, tick, assetType as AssetType)).gt("0")
        ) {
          set.add(tick);
        }
      }
    }
    return Array.from(set);
  }

  tryCreate(tick: string) {
    for (let assetType in this.map) {
      this.tryCreateWithAssetType(tick, assetType);
    }
  }

  tryCreateWithAssetType(tick: string, assetType: string) {
    if (!this.map[assetType][tick]) {
      this.map[assetType][tick] = new Brc20({}, tick, "0", assetType);
      this.map[assetType][tick].setObserver(this.observer);

      if (this.observer) {
        this.observer.notify<NotifyAssetData>("asset", {
          assetType,
          tick,
          address: "0",
          balance: "0",
        });
      }
    }
  }

  isExist(tick: string) {
    return !!this.map["swap"][tick];
  }

  get(tick: string, assetType: AssetType = "swap") {
    return this.map[assetType][tick];
  }

  getSwapSupply(tick: string) {
    return uintCal([
      this.get(tick, "swap")?.Supply || "0",
      "add",
      this.get(tick, "lock")?.Supply || "0",
    ]);
  }

  getBalance(
    address: string,
    tick: string,
    assetType: AssetType = "swap"
  ): string {
    try {
      need(!!this.map[assetType][tick]);
      return this.map[assetType][tick].balanceOf(address);
    } catch (err) {
      return "0";
    }
  }

  getAggregateBalance(
    address: string,
    tick: string,
    assetTypes: AssetType[]
  ): string {
    if (assetTypes.length == 1) {
      return this.getBalance(address, tick, assetTypes[0]);
    } else {
      let ret = "0";
      assetTypes.forEach((assetType) => {
        ret = uintCal([ret, "add", this.getBalance(address, tick, assetType)]);
      });
      return ret;
    }
  }

  mint(
    address: string,
    tick: string,
    amount: string,
    assetType: AssetType = "swap"
  ) {
    this.tryCreate(tick);
    this.map[assetType][tick].mint(address, amount);
  }

  burn(
    address: string,
    tick: string,
    amount: string,
    assetType: AssetType = "swap"
  ) {
    this.map[assetType][tick].burn(address, amount);
  }

  convert(
    address: string,
    tick: string,
    amount: string,
    fromAssetType: AssetType,
    toAssetType: AssetType
  ) {
    this.tryCreateWithAssetType(tick, fromAssetType);
    this.tryCreateWithAssetType(tick, toAssetType);
    this.map[fromAssetType][tick].burn(address, amount);
    this.map[toAssetType][tick].mint(address, amount);
  }

  transfer(
    tick: string,
    from: string,
    to: string,
    amount: string,
    fromAssetType: AssetType,
    toAssetType: AssetType
  ) {
    this.tryCreateWithAssetType(tick, fromAssetType);
    this.tryCreateWithAssetType(tick, toAssetType);
    this.map[fromAssetType][tick].burn(from, amount);
    this.map[toAssetType][tick].mint(to, amount);
  }

  swap(
    address: string,
    tickIn: string,
    tickOut: string,
    amountIn: string,
    amountOut: string,
    assetType: AssetType = "swap"
  ) {
    const pair = getPairStrV2(tickIn, tickOut);
    this.map[assetType][tickIn].transfer(address, pair, amountIn);
    this.map[assetType][tickOut].transfer(pair, address, amountOut);
  }

  dataRefer() {
    return this.map;
  }
}
