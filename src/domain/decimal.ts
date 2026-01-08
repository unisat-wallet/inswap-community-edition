import { bn } from "../contract/bn";
import { need } from "./utils";

/**
 * Hold all ticker's decimal
 */
export class Decimal {
  private map: { [key: string]: string } = {};

  static fromData(data: { [key: string]: string }) {
    const ret = new Decimal();
    ret.map = data;
    return ret;
  }

  getRealTick(tick: string) {
    for (let k in this.map) {
      if (k.toLowerCase() == tick.toLowerCase()) {
        return k;
      }
    }
    return tick;
  }
  get(tick: string, throwError = true) {
    let ret = this.map[tick];
    if (!ret) {
      for (let k in this.map) {
        if (k.toLowerCase() == tick.toLowerCase()) {
          ret = this.map[k];
          break;
        }
      }
    }
    if (throwError) {
      need(!!ret, "get decimal fail: " + tick);
    }
    return ret;
  }
  set(tick: string, decimal: string) {
    need(
      bn(decimal).gte("0") && bn(decimal).lte("18"),
      "set decimal fail: " + tick
    );
    this.map[tick] = decimal;
  }
  getAllTick() {
    const ret: string[] = [];
    for (let tick in this.map) {
      ret.push(tick);
    }
    return ret;
  }
  async init() {
    const res = await tickDao.find({});
    res.forEach((item) => {
      this.map[item.tick] = item.decimal;
    });
  }
  async trySetting(_tick: string) {
    if (!this.map[_tick]) {
      const info = await api.brc20Info(_tick);
      const tick = info.ticker;
      const decimal = info.decimal.toString();
      await tickDao.upsertOne({ tick }, { $set: { tick, decimal } });
      this.set(tick, decimal);
    }
  }
}
