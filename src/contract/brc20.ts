import { NotifyAssetData } from "./assets";
import { bn, uintCal } from "./bn";
import { need } from "./contract-utils";
import { Observer } from "./observer";

export class Brc20 {
  balance: { [address: string]: string } = {};
  tick: string;
  private supply: string;
  private assetType: string;

  private observer: Observer;
  setObserver(observer: Observer) {
    this.observer = observer;
  }

  constructor(
    balance: { [address: string]: string },
    tick: string,
    supply: string,
    assetType: string
  ) {
    this.balance = balance;
    this.tick = tick;
    this.supply = supply || "0";
    this.assetType = assetType;
  }

  get Supply() {
    return this.supply;
  }

  balanceOf(address: string) {
    return this.balance[address] || "0";
  }

  transfer(from: string, to: string, amount: string) {
    this.checkAmount(amount);
    this.checkAddress(from, amount);
    this.balance[from] = uintCal([this.balance[from], "sub", amount]);
    this.balance[to] = uintCal([this.balance[to] || "0", "add", amount]);
    this.checkAddress(from);
    this.checkAddress(to);

    if (this.observer) {
      this.observer.notify<NotifyAssetData>("asset", {
        assetType: this.assetType,
        tick: this.tick,
        address: from,
        balance: this.balanceOf(from),
      });
      this.observer.notify<NotifyAssetData>("asset", {
        assetType: this.assetType,
        tick: this.tick,
        address: to,
        balance: this.balanceOf(to),
      });
    }
  }

  mint(address: string, amount: string) {
    this.checkAmount(amount);
    this.balance[address] = uintCal([
      this.balance[address] || "0",
      "add",
      amount,
    ]);
    this.supply = uintCal([this.supply, "add", amount]);
    this.checkAddress(address);

    if (this.observer) {
      this.observer.notify<NotifyAssetData>("asset", {
        assetType: this.assetType,
        tick: this.tick,
        address,
        balance: this.balanceOf(address),
      });
    }
  }

  burn(address: string, amount: string) {
    this.checkAmount(amount);
    this.checkAddress(address, amount);
    this.balance[address] = uintCal([
      this.balance[address] || "0",
      "sub",
      amount,
    ]);
    this.supply = uintCal([this.supply, "sub", amount]);
    this.checkAddress(address);

    if (this.observer) {
      this.observer.notify<NotifyAssetData>("asset", {
        assetType: this.assetType,
        tick: this.tick,
        address,
        balance: this.balanceOf(address),
      });
    }
  }

  private checkAmount(amount: string) {
    need(bn(amount).gt("0"), "invalid amount: " + this.tick);
  }

  private checkAddress(address: string, value = "0") {
    need(
      bn(this.balance[address]).gte(value),
      "insufficient amount: " + this.tick + ", address: " + address
    );
  }
}
