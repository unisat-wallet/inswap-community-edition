import { AxiosInstance } from "axios";
import {
  BridgeConfigRes,
  BridgeConfirmDepositReq,
  BridgeConfirmWithdrawReq,
  BridgeCreateDepositReq,
  BridgeCreateWithdrawReq,
  BridgeHistoryReq,
  BridgeTxStatusReq,
  BridgeTxStatusRes,
} from "../lib/bridge-api/types";
import { TickerFilter } from "../lib/open-api/types";
import {
  AlkanesInfo,
  AlkanesSummary,
  AvailableBalanceRes,
  BlockInfo,
  Brc20Info,
  Brc20Summary,
  FreeQuotaSummaryRes,
  HealthyStatus,
  ModuleInscriptionInfo,
  NFT,
  PriceInfo,
  RunesSummary,
  ToSignInput,
  UseFreeQuotaReq,
  UseFreeQuotaRes,
  UTXO,
  UtxoData,
} from "../types/api";
import { Result } from "../types/func";
import { NetworkType } from "../types/route";
import { removeUndefined } from "../utils/utils";

export const PRICE_TICKER_MAP = {
  bBTC___: "",
  sBTC___000: "",
  bSATS_: "brc20/sats1000",
  sSATS___000: "brc20/sats1000",
  bORDI_: "brc20/ordi",
  sORDI___000: "brc20/ordi",
  sPIZZA___000: "brc20/pizza",
  sFB___000: "fb",
  bFB_____: "fb",
};

export class API {
  private cache: {
    [key: string]: { timestamp: number; intervalMs: number; data: any };
  } = {};

  readonly statistic: { [key: string]: number[] } = {};

  tick() {
    for (let key in this.cache) {
      if (Date.now() - this.cache[key].timestamp > this.cache[key].intervalMs) {
        delete this.cache[key];
      }
    }
  }

  constructor() {}

  private async cacheRequest<T>(
    key: string,
    intervalMs: number,
    requestFunc: () => Promise<T>
  ): Promise<T> {
    if (this.cache[key]) {
      return this.cache[key].data;
    }

    const ret = await requestFunc();
    this.cache[key] = {
      data: ret,
      intervalMs,
      timestamp: Date.now(),
    };
    return ret;
  }

  private getBridgeApi(networkType: NetworkType) {
    if (networkType === NetworkType.FRACTAL_BITCOIN_MAINNET) {
      return simpleBridgeAPI.fractal;
    } else {
      return simpleBridgeAPI.bitcoin;
    }
  }

  private getOpenAPI(network: NetworkType = null) {
    if (!network) {
      network = process.env.BITCOIN_NETWORK as any;
    }

    if (network == NetworkType.BITCOIN_MAINNET) {
      return openAPI.bitcoin;
    } else {
      return openAPI.fractal;
    }
  }

  async healthyStatus(): Promise<HealthyStatus> {
    return this.getOpenAPI().getHealthz();
  }

  async bridgeTxStatus(params: BridgeTxStatusReq, networkType: NetworkType) {
    return this.cacheRequest<BridgeTxStatusRes>(
      `bridgeTxStatus-${networkType}-${JSON.stringify(params)}`,
      5_000,
      async () => this.getBridgeApi(networkType).getTxStatus(params)
    );
  }

  async bridgeConfig(networkType: NetworkType): Promise<BridgeConfigRes> {
    return this.cacheRequest<BridgeConfigRes>(
      `bridgeConfig-${networkType}`,
      60_000,
      async () => this.getBridgeApi(networkType).getConfig()
    );
  }

  async bridgeHistory(params: BridgeHistoryReq, networkType: NetworkType) {
    return this.getBridgeApi(networkType).getHistory(params);
  }

  async createBridgeDeposit(
    params: BridgeCreateDepositReq,
    networkType: NetworkType
  ) {
    return this.getBridgeApi(networkType).createDeposit(params);
  }

  async confirmBridgeDeposit(
    params: BridgeConfirmDepositReq,
    networkType: NetworkType
  ) {
    return this.getBridgeApi(networkType).confirmDeposit(params);
  }

  async createBridgeWithdraw(
    params: BridgeCreateWithdrawReq,
    networkType: NetworkType
  ) {
    return this.getBridgeApi(networkType).createWithdraw(params);
  }

  async confirmBridgeWithdraw(
    params: BridgeConfirmWithdrawReq,
    networkType: NetworkType
  ) {
    return this.getBridgeApi(networkType).confirmWithdraw(params);
  }

  async broadcast(txHex: string): Promise<string> {
    return this.getOpenAPI().localPushtx(txHex);
  }

  async brc20Info(
    tick: string,
    network: NetworkType = null
  ): Promise<Brc20Info> {
    return this.cacheRequest<Brc20Info>(
      `brc20Info-${network}-${tick}`,
      300_000,
      async () => this.getOpenAPI(network).getBrc20TickerInfo(tick)
    );
  }

  async brc20Summary(
    address: string,
    network: NetworkType = null
  ): Promise<Brc20Summary> {
    return this.getOpenAPI(network).getAddressBrc20Summary({
      address,
      start: 0,
      limit: 500,
      ticker_filter: TickerFilter.ALL,
    });
  }

  async runesSummary(
    address: string,
    network: NetworkType = null
  ): Promise<RunesSummary> {
    return this.getOpenAPI(network).getAddressRunesBalanceList(address, 0, 500);
  }

  async alkanesSummary(
    address: string,
    network: NetworkType = null
  ): Promise<AlkanesSummary> {
    return this.getOpenAPI(network).getAddressAlkanesTokenList(address, 0, 500);
  }

  async alkanesInfo(
    alkaneid: string,
    network: NetworkType = null
  ): Promise<AlkanesInfo> {
    return this.cacheRequest<AlkanesInfo>(
      `alkanesInfo-${network}-${alkaneid}`,
      300_000,
      async () => this.getOpenAPI(network).getAlkanesInfo(alkaneid)
    );
  }

  async availableBalance(
    address: string,
    network: NetworkType = null
  ): Promise<AvailableBalanceRes> {
    return await this.getOpenAPI(network).getAddressAvailableBalance(address);
  }

  async inscriptionInfo(inscriptionId: string): Promise<NFT> {
    return await this.getOpenAPI().getInscriptionInfo(inscriptionId);
  }

  async inscriptionContent(inscriptionId: string): Promise<string> {
    return await this.getOpenAPI().getInscriptionContent(inscriptionId);
  }

  async utxo(txid: string, vout: number): Promise<UTXO> {
    return await this.getOpenAPI().getUtxo(txid, vout);
  }

  async addressUTXOs(
    address: string,
    cursor?: number,
    size?: number
  ): Promise<UTXO[]> {
    const ret = (await this.getOpenAPI().getAddressAvailableUtxo(
      address,
      cursor,
      size
    )) as UtxoData;
    return ret.utxo.reverse();
  }

  async txInfo(txid: string): Promise<{ height: number; timestamp: number }> {
    return this.cacheRequest<{ height: number; timestamp: number }>(
      `getTxInfo-${txid}`,
      10_000,
      async () => this.getOpenAPI().getTx(txid)
    );
  }

  async feeRate(): Promise<number> {
    return this.cacheRequest<number>(`feeRate`, 60_000, async () => {
      const ret = await this.getOpenAPI().getFeesRecommended();
      return ret.fastestFee;
    });
  }

  async bestHeight() {
    const ret = await this.getOpenAPI().getBrc20BestHeight();
    return ret.height;
  }

  async blockInfo(): Promise<BlockInfo> {
    const ret = await this.getOpenAPI().getBlockChainInfo();
    return ret;
  }

  async coinmarketcapPriceInfo(tick: string): Promise<PriceInfo> {
    return this.cacheRequest<PriceInfo>(
      `coinmarketcapPriceInfo-${tick}`,
      60_000,
      async () => {
        if (tick == "sSUSD___000") {
          return {
            price: 1,
            updateTime: Date.now(),
          };
        }

        const tickPath = PRICE_TICKER_MAP[tick];
        if (tickPath == undefined) {
          return {
            price: 0,
            updateTime: Date.now(),
          };
        }

        if (tickPath == "") {
          return this.getOpenAPI().getBitcoinPrice();
        }
        const res = await this.getOpenAPI().getTickerPrice(tickPath);
        if (tickPath == "/brc20/sats1000") {
          res.price = res.price / 1000;
        }
        return res;
      }
    );
  }

  async eventRawList(params: {
    moduleId: string;
    cursor: number;
    size: number;
  }) {
    return this.getOpenAPI().getBrc20ModuleHistory(
      params.moduleId,
      params.cursor,
      params.size
    );
  }

  async moduleInscriptionInfo(
    inscriptionId: string
  ): Promise<ModuleInscriptionInfo> {
    return this.getOpenAPI().getBrc20ModuleInscriptionInfo(inscriptionId);
  }

  async commitVerify(params: { commits: string[]; results: Result[] }) {
    return this.getOpenAPI().verifyBrc20ModuleCommit(params);
  }

  private async get(
    tag: string,
    axios: AxiosInstance,
    url: string,
    query?: object
  ) {
    query = removeUndefined(query);
    let params;
    if (Object.keys(query).length > 0) {
      params = {
        params: query,
      };
    }
    const key = tag;
    if (!this.statistic[key] || this.statistic[key].length > 10000) {
      this.statistic[key] = [];
    }
    const start = Date.now();
    try {
      const ret = await axios.get(url, params);
      const interval = Date.now() - start;
      this.statistic[key].push(interval);
      metric.obverse(key, interval);
      return ret.data;
    } catch (err) {
      this.statistic[key].push(-1);
      metric.obverse(key, -1);
      throw err;
    }
  }

  private async post(
    tag: string,
    axios: AxiosInstance,
    url: string,
    body?: object
  ) {
    body = body ?? {};

    const key = tag;
    if (!this.statistic[key] || this.statistic[key].length > 10000) {
      this.statistic[key] = [];
    }
    const start = Date.now();
    try {
      const ret = await axios.post(url, body, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      const interval = Date.now() - start;
      this.statistic[key].push(interval);
      metric.obverse(key, interval);
      return ret.data;
    } catch (err) {
      this.statistic[key].push(-1);
      metric.obverse(key, -1);
      throw err;
    }
  }

  async freeQuotaSummary(address: string): Promise<FreeQuotaSummaryRes> {
    // TODO
    return {
      address,
      tick: "",
      totalQuota: "",
      usedQuota: "",
      btcFbRate: 0,
      hasVoucher: false,
    };
  }

  async useFreeQuota(params: UseFreeQuotaReq): Promise<UseFreeQuotaRes> {
    // TODO
    return {};
  }

  async signByKeyring(
    tag: string,
    psbtHex: string,
    toSignInputs: ToSignInput[]
  ) {
    // TODO
    return "";
  }
}
