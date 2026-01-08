import { getAddressType } from "@unisat/wallet-sdk/lib/address";
import { NetworkType } from "@unisat/wallet-sdk/lib/network";
import { LocalWallet } from "@unisat/wallet-sdk/lib/wallet";
import Axios, { AxiosInstance } from "axios";
import fs from "fs";

export type SendReq = {
  address: string;
  tick: string;
  amount: string;
  feeTick: string;
  to: string;
  ts: number;
  feeAmount?: string;
  feeTickPrice?: string;
  sigs?: string[];
  payType?: any;
  rememberPayType?: boolean;
};

export type SendRes = {
  id: string;
};

export type PreRes = {
  ids: string[];
  signMsgs: string[];

  // feeTick
  feeAmount: string;
  feeTick: string;
  feeTickPrice: string;
  feeBalance: string;

  // free quota
  totalFreeQuota: string;
  remainingFreeQuota: string;
  totalUsedFreeQuota: string;
  usageFreeQuota: string;

  usdPrice: string;
};

export async function post<Req, Res>(
  axios: AxiosInstance,
  url: string,
  data = {} as Req
) {
  try {
    const res = await axios.post(url, data, { timeout: 3000 });
    if (res.status !== 200) {
      throw new Error(url + ": " + res.statusText);
    }
    if (res.data.code !== 0) {
      throw new Error(url + ": " + res.data.msg);
    }
    return res.data.data as Res;
  } catch (err) {
    throw err;
  }
}

export async function get<Res>(
  axios: AxiosInstance,
  url: string,
  params?: object
) {
  try {
    const res = await axios.get(url, { timeout: 3000, params });
    if (res.status !== 200) {
      throw new Error(url + ": " + res.statusText);
    }
    if (res.data.code !== 0) {
      throw new Error(url + ": " + res.data.msg);
    }
    return res.data.data as Res;
  } catch (err) {
    throw err;
  }
}

export class SwapAPI {
  private axios: AxiosInstance;

  constructor(baseUrl: string) {
    this.axios = Axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: Object.assign({
        "Content-Type": "application/json",
      }),
    });
  }

  async preSend(params: SendReq): Promise<PreRes> {
    const url = `/pre_send`;
    return await get(this.axios, url, params);
  }

  async send(params: SendReq): Promise<SendRes> {
    const url = `/send`;
    return await post(this.axios, url, params);
  }
}

type SendItem = {
  address: string;
  amount: number;
  sended: boolean;
};

(async () => {
  const baseUrl = "http://127.0.0.1:30020";
  const networkType = NetworkType.MAINNET;
  const wif = "";
  const from = "";

  const swapApi = new SwapAPI(baseUrl);
  const dataPath = __dirname + "/batch-send-data.json";
  const data = require(dataPath) as SendItem[];

  console.log("start send");

  // test write file
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");

  for (const item of data) {
    if (item.sended) {
      continue;
    }
    const sendReq: SendReq = {
      address: from,
      tick: "sFB___000",
      amount: item.amount.toString(),
      feeTick: "sFB___000",
      to: item.address,
      ts: Math.floor(Date.now() / 1000),
      payType: "tick",
    };
    const preRes = await swapApi.preSend(sendReq);
    sendReq.feeTickPrice = preRes.feeTickPrice;
    sendReq.feeAmount = preRes.feeAmount;
    sendReq.sigs = [];
    const proxyWallet = new LocalWallet(wif, getAddressType(from), networkType);
    for (let i = 0; i < preRes.signMsgs.length; i++) {
      const sig = await proxyWallet.signMessage(
        preRes.signMsgs[i],
        "bip322-simple"
      );
      sendReq.sigs.push(sig);
    }
    const res = await swapApi.send(sendReq);
    console.log("send success", item.address, item.amount);

    // update data
    item.sended = true;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
  }
  console.log("all send success");
})();
