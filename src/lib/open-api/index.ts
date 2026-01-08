import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
  AlkaneEntry,
  InscriptionEventsRes,
  InscriptionInfo,
  OpenApiAlkaneTokenBalance,
  RuneBalance,
  TickerDetail,
  TickerFilter,
  UTXO,
  VerifyCommitRes,
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

class BaseOpenApi {
  private axios: AxiosInstance;

  constructor(params: { baseUrl: string; host?: string; apikey?: string }) {
    let headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (params.apikey) {
      headers["Authorization"] = `Bearer ${params.apikey}`;
    }
    if (params.host) {
      headers["Host"] = params.host;
    }
    this.axios = axios.create({
      baseURL: params.baseUrl,
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
        if (response.request.path.includes("/inscription/content")) {
          return res;
        }
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

  async getTx(txid: string) {
    const response = await this.axios.get<
      null,
      {
        blkid: string;
        confirmations: number;
        height: number;
        idx: number;
        inSatoshi: number;
        locktime: number;
        nIn: number;
        nInInscription: number;
        nLostInscription: number;
        nNewInscription: number;
        nOut: number;
        nOutInscription: number;
        outSatoshi: number;
        size: number;
        timestamp: number;
        txid: string;
        witOffset: number;
      }
    >(`/v1/indexer/tx/${txid}`);
    return response;
  }

  async getBrc20BestHeight() {
    const response = await this.axios.get<
      null,
      {
        height: number;
        blockid: string;
        timestamp: number;
        total: number;
      }
    >(`/v1/indexer/brc20/bestheight`);
    return response;
  }

  async getBrc20TickerInfo(ticker: string) {
    const response = await this.axios.get<null, TickerDetail>(
      `/v1/indexer/brc20/${ticker}/info`
    );
    return response;
  }

  // Common
  async getBlockChainInfo() {
    const response = await this.axios.get<
      null,
      {
        chain: string;
        blocks: number;
        headers: number;
        bestBlockHash: string;
        prevBlockHash: string;
        difficulty: string;
        medianTime: number;
        chainwork: string;
      }
    >("/v1/indexer/blockchain/info");
    return response;
  }

  async getFeesRecommended() {
    const response = await this.axios.get<
      null,
      {
        fastestFee: number;
        halfHourFee: number;
        hourFee: number;
        economyFee: number;
        minimumFee: number;
        updateTime: number;
      }
    >(`/v1/indexer/fees/recommended`);
    return response;
  }

  async getAddressAvailableBalance(address: string) {
    const response = await this.axios.get<
      null,
      {
        availableBalance: number;
        unavailableBalance: number;
        totalBalance: number;
        totalUtxoCount: number;
        availableUtxoCount: number;
        unavailableUtxoCount: number;
      }
    >(`/v1/indexer/address/${address}/available-balance?withLowFee=true`);
    return response;
  }

  async localPushtx(txhex: string): Promise<string> {
    const response = await this.axios.post<null, string>(
      "/v1/indexer/local_pushtx",
      {
        txhex,
      }
    );
    return response;
  }

  async getInscriptionInfo(inscriptionId: string) {
    const response = await this.axios.get<null, InscriptionInfo>(
      `/v1/indexer/inscription/info/${inscriptionId}`
    );
    return response;
  }

  async getInscriptionContent(inscriptionId: string) {
    const response = await this.axios.get<null, string>(
      `/v1/indexer/inscription/content/${inscriptionId}`
    );
    return response;
  }

  async getUtxo(txid: string, vout: number) {
    const response = await this.axios.get<null, UTXO>(
      `/v1/indexer/utxo/${txid}/${vout}`
    );
    return response;
  }

  async getAddressAvailableUtxo(address: string, cursor = 0, size = 16) {
    const response = await this.axios.get<
      null,
      {
        cursor: number;
        total: number;
        utxo: UTXO[];
      }
    >(
      `/v1/indexer/address/${address}/available-utxo-data?cursor=${cursor}&size=${size}`
    );
    return response;
  }

  // price
  async getBitcoinPrice() {
    const response = await this.axios.get<
      null,
      {
        price: number;
        updateTime: number;
      }
    >(`/v1/price/btc`);
    return response;
  }

  async getTickerPrice(ticker: string) {
    const response = await this.axios.get<
      null,
      {
        price: number;
        updateTime: number;
      }
    >(`/v1/price/${ticker}`);
    return response;
  }

  // BRC20
  async getAddressBrc20Summary({
    address,
    start,
    limit,
    ticker_filter,
  }: {
    address: string;
    start: number;
    limit: number;
    ticker_filter: TickerFilter;
  }) {
    const response = await this.axios.get<
      null,
      {
        detail: {
          availableBalance: string;
          overallBalance: string;
          ticker: string;
          transferableBalance: string;
          selfMint?: boolean;
          h?: number;
        }[];
        height: number;
        start: number;
        total: number;
      }
    >(
      `/v1/indexer/address/${address}/brc20/summary?start=${start}&limit=${limit}&tick_filter=${ticker_filter}&exclude_zero=true`
    );
    return response;
  }

  async getBrc20ModuleInscriptionInfo(inscriptionId: string) {
    const response = await this.axios.get<
      null,
      {
        utxo: UTXO;
        //...
        inscriptionId: string;
        data?: {
          amt: string;
          balance: string;
          module: string;
          op: string;
          tick: string;
        };
      }
    >(
      `/v1/indexer/brc20-module/brc20-module/inscription/info/${inscriptionId}`
    );
    return response;
  }

  async getBrc20ModuleHistory(
    moduleId: string,
    start = 0,
    end = 0,
    cursor = 0,
    size = 16
  ) {
    const response = await this.axios.get<null, InscriptionEventsRes>(
      `/v1/indexer/brc20-module/${moduleId}/history?start=${start}&end=${end}&cursor=${cursor}&size=${size}`
    );
    return response;
  }

  // brc20-module/verify-commit
  async verifyBrc20ModuleCommit(params: { commits: string[]; results: any[] }) {
    const response = await this.axios.post<null, VerifyCommitRes>(
      `/v1/indexer/brc20-module/verify-commit`,
      params
    );
    return response;
  }

  // Runes
  async getAddressRunesBalanceList(
    address: string,
    start: number,
    limit: number
  ) {
    const response = await this.axios.get<
      null,
      {
        start: number;
        total: number;
        detail: RuneBalance[];
      }
    >(
      `/v1/indexer/address/${address}/runes/balance-list?start=${start}&limit=${limit}`
    );
    return response;
  }

  // Alkanes
  async getAddressAlkanesTokenList(
    address: string,
    start: number,
    limit: number
  ) {
    const response = await this.axios.get<
      null,
      {
        start: number;
        total: number;
        detail: OpenApiAlkaneTokenBalance[];
      }
    >(
      `/v1/indexer/address/${address}/alkanes/token-list?start=${start}&limit=${limit}`
    );
    return response;
  }

  async getAlkanesInfo(alkane: string) {
    const response = await this.axios.get<null, AlkaneEntry>(
      `/v1/indexer/alkanes/${alkane}/info`
    );
    return response;
  }

  async getHealthz(): Promise<{
    fb_brc20_indexer: number;
  }> {
    const response = await this.axios.get<null, { fb_brc20_indexer: number }>(
      `/v1/indexer/healthz`
    );
    return response;
  }
}

export class OpenApi {
  bitcoin: BaseOpenApi;
  fractal: BaseOpenApi;

  constructor(params: {
    bitcoin: { apiKey: string };
    fractal: { apiKey: string };
  }) {
    this.bitcoin = new BaseOpenApi({
      baseUrl: "https://open-api.unisat.io",
      apikey: params.bitcoin.apiKey,
    });
    this.fractal = new BaseOpenApi({
      baseUrl: "https://open-api-fractal.unisat.io",
      apikey: params.fractal.apiKey,
    });
  }
}
