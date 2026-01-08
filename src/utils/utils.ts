import { Mutex, MutexInterface } from "async-mutex";
import { AxiosError } from "axios";
import * as bitcoin from "bitcoinjs-lib";
import Joi from "joi";
import _, { Dictionary } from "lodash";
import moment from "moment-timezone";
import { bn, decimalCal } from "../contract/bn";
import { not_support_address } from "../domain/error";
import { toXOnly } from "../lib/bitcoin";
import { AddressType } from "../types/domain";
import { NetworkType } from "../types/route";
import { checkTimeUint, need } from "../domain/utils";

export function schema(
  _req: Joi.Schema,
  method: "post" | "get",
  _res?: Joi.Schema,
  info?: { summary: string; apiDoc: boolean }
) {
  const convert = require("joi-to-json");

  const getInfo = () => {
    if (info?.apiDoc) {
      return { ...info, tags: ["PizzsSwap"] };
    } else {
      {
      }
    }
  };

  const getRequest = () => {
    if (method == "post") {
      return {
        body: convert(_req, "open-api"),
      };
    } else {
      return {
        query: convert(_req, "open-api"),
      };
    }
  };

  const getResponse = () => {
    if (_res && config.openSwagger) {
      return {
        response: {
          200: {
            type: "object",
            properties: {
              code: { type: "number" },
              msg: { type: "string" },
              data: {
                ...convert(_res, "open-api"),
              },
            },
            required: ["msg", "code", "data"],
          },
        },
      };
    } else {
    }
  };

  return {
    schema: {
      explode: true,
      style: "deepObject",
      ...getInfo(),
      ...getRequest(),
      ...getResponse(),
    },
    validatorCompiler: () => {
      return (data) => _req.validate(data);
    },
  };
}

export function remove<T>(arr: T[], e: T) {
  return arr.filter((a) => {
    return a !== e;
  });
}

export function lastItem<T>(arr: T[]) {
  return arr[arr.length - 1];
}

export function removeUndefined<T extends Dictionary<any>>(o: T): T {
  return _.omitBy(o, _.isUndefined) as T;
}

export function sha256(msg: string) {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  hash.update(msg);
  const data = hash.digest("hex");
  return data;
}

export function getCurDate() {
  return moment().tz("Asia/Hong_Kong").format("YYYY-MM-DD");
}

export function getDate(timestamp: number) {
  return moment(timestamp).tz("Asia/Hong_Kong").format("YYYY-MM-DD HH:mm:ss");
}

export function getTodayMidnightSec() {
  const moment = require("moment-timezone");
  const todayMidnight = moment().tz("Asia/Hong_Kong").startOf("day");
  const todayMidnightSec = todayMidnight.unix();
  return todayMidnightSec;
}

export function loggerError(tag: string, err) {
  if (err instanceof AxiosError) {
    logger.error({
      tag,
      msg: "",
      error: err.message,
      url: err.config.url,
    });
  } else {
    logger.error({
      tag,
      msg: "",
      error: err.message,
      stack: err.stack,
    });
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isNetWorkError(err) {
  return err instanceof AxiosError;
}

export async function queue<T>(mutex: Mutex, func: () => T) {
  let release: MutexInterface.Releaser;
  try {
    release = await mutex.acquire();
    return await func();
  } finally {
    release();
  }
}

export function normalizeNumberStr(str: string) {
  if (!bn(str).isNaN()) {
    return bn(str).toString();
  } else {
    return str;
  }
}

export function isProportional(amount0: string, amount1: string) {
  const result0 = decimalCal([amount0, "div", amount1]);
  const result1 = decimalCal([amount1, "div", amount0]);
  if (bn(result0).gt("0") && bn(result1).gt("0")) {
    if (bn(result0).isInteger() || bn(result1).isInteger()) {
      return true;
    }
  }
  return false;
}

export function getAddress(
  addressType: AddressType,
  pubkey: string,
  networkType: NetworkType
) {
  let network = bitcoin.networks.bitcoin;
  if (
    networkType == NetworkType.BITCOIN_TESTNET ||
    networkType == NetworkType.BITCOIN_TESTNET4 ||
    networkType == NetworkType.BITCOIN_SIGNET
  ) {
    network = bitcoin.networks.testnet;
  }
  if (addressType == AddressType.P2TR) {
    const { address } = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(pubkey, "hex")),
      network,
    });
    return address;
  } else if (addressType == AddressType.P2WPKH) {
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(pubkey, "hex"),
      network,
    });
    return address;
  } else {
    throw new Error(not_support_address);
  }
}

export function timeConversion(
  timeString: string,
  conversionType: "millisecond" | "seconds" | "minutes"
) {
  const uint = timeString.slice(-1);
  checkTimeUint(uint);
  const value = parseInt(timeString.slice(0, -1));
  need(!isNaN(value), "timeString not available");
  const unitToMs: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  const milliseconds = value * unitToMs[uint];
  switch (conversionType) {
    case "millisecond":
      return milliseconds;
    case "seconds":
      return milliseconds / 1000;
    case "minutes":
      return milliseconds / (60 * 1000);
    default:
      throw new Error(`Unsupported conversion type: ${conversionType}`);
  }
}
