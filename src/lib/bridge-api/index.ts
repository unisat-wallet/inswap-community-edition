import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
  BridgeConfigRes,
  BridgeConfirmDepositReq,
  BridgeConfirmDepositRes,
  BridgeConfirmWithdrawReq,
  BridgeConfirmWithdrawRes,
  BridgeCreateDepositReq,
  BridgeCreateDepositRes,
  BridgeCreateWithdrawReq,
  BridgeHistoryReq,
  BridgeHistoryRes,
  BridgeTxStatusReq,
  BridgeTxStatusRes,
} from "./types";

class RequestError extends Error {
  constructor(
    public message: string,
    public status?: number,
    public response?: AxiosResponse
  ) {
    super((response && response.config ? response.config.url : "") + message);
  }

  isApiException = true;
}

class BridgeApi {
  private axios: AxiosInstance;

  constructor(params: { url: string; host?: string }) {
    let headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (params.host) {
      headers["Host"] = params.host;
    }
    this.axios = axios.create({
      baseURL: params.url,
      headers,
    });

    this.axios.interceptors.response.use(
      (async (
        response: AxiosResponse<{
          code: number;
          msg: string;
          data: any;
        }>
      ) => {
        const res = response.data;
        if (res.code != 0) {
          throw new RequestError(res.msg);
        }
        return res.data;
      }) as any,
      (error) => {
        const baseURL = error.config?.baseURL || "";
        const url = error.config?.url || "";
        const fullUrl = baseURL + url;
        if (error.response) {
          const msg =
            typeof error.response.data === "string"
              ? error.response.data
              : error.response.data?.msg || JSON.stringify(error.response.data);
          return Promise.reject(
            new RequestError(
              `[${fullUrl}] ${msg}`,
              error.response.status,
              error.response
            )
          );
        }
        if (error.request) {
          return Promise.reject(
            new RequestError(`[${fullUrl}] no response from server`)
          );
        }
        if (error.isAxiosError) {
          return Promise.reject(
            new RequestError(`[${fullUrl}] ${error.message}`)
          );
        }
        return Promise.reject(error);
      }
    );
  }

  async getConfig() {
    const response = await this.axios.get<null, BridgeConfigRes>(`/config`);
    return response;
  }

  async getTxStatus(params: BridgeTxStatusReq) {
    const response = await this.axios.get<null, BridgeTxStatusRes>(
      `/tx_status?txid=${params.txid}&type=${params.type}`
    );
    return response;
  }

  async getHistory(params: BridgeHistoryReq) {
    const response = await this.axios.get<null, BridgeHistoryRes>(`/history`, {
      params,
    });
    return response;
  }

  async createDeposit(params: BridgeCreateDepositReq) {
    const response = await this.axios.get<
      BridgeCreateDepositReq,
      BridgeCreateDepositRes
    >(`/create_deposit`, { params });
    return response;
  }

  async confirmDeposit(params: BridgeConfirmDepositReq) {
    const response = await this.axios.post<null, BridgeConfirmDepositRes>(
      `/confirm_deposit`,
      params
    );
    return response;
  }

  async createWithdraw(params: BridgeCreateWithdrawReq) {
    const response = await this.axios.get<
      BridgeCreateWithdrawReq,
      BridgeCreateDepositRes
    >(`/create_withdraw`, { params });
    return response;
  }

  async confirmWithdraw(params: BridgeConfirmWithdrawReq) {
    const response = await this.axios.post<null, BridgeConfirmWithdrawRes>(
      `/confirm_withdraw`,
      params
    );
    return response;
  }
}

export class SimpleBridgeApi {
  public bitcoin: BridgeApi;
  public fractal: BridgeApi;

  constructor(params: {
    bitcoin: {
      url: string;
      host?: string;
    };
    fractal: {
      url: string;
      host?: string;
    };
  }) {
    this.bitcoin = new BridgeApi(params.bitcoin);
    this.fractal = new BridgeApi(params.fractal);
  }
}
