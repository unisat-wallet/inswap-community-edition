import { decimalCal } from "../contract/bn";
import { PriceInfo } from "../types/api";
import { ContractConfig } from "../types/domain";
import { AssetType, NetworkType } from "../types/route";
import { UNCONFIRM_HEIGHT } from "./constant";
import { need } from "./utils";

const TAG = "env";

export class Env {
  private newestHeight = 0;
  private bestHeight = 0;
  private btcPriceRes: PriceInfo;
  private fbPriceRes: PriceInfo;
  private satsPriceRes: PriceInfo;
  private feeRate = 0;
  private lastUpdateFeeRateTime: number = Date.now();
  private config: ContractConfig;
  private epoch3StartTime = 0;
  private epoch3EndTime = 0;

  assetList: {
    l1Tick: string;
    l1AssetType: AssetType;
    l1NetworkType: NetworkType;
    l2Tick: string;
    l2AssetType: AssetType;
    l2NetworkType: NetworkType;
  }[];

  // mempool newest height
  get NewestHeight() {
    need(this.newestHeight > 0 && this.newestHeight !== UNCONFIRM_HEIGHT);
    return this.newestHeight;
  }

  // the latest block height processed by BRC20
  get BestHeight() {
    need(this.bestHeight > 0 && this.newestHeight !== UNCONFIRM_HEIGHT);
    return this.bestHeight;
  }

  get FbPrice() {
    return this.fbPriceRes.price;
  }

  get BtcPrice() {
    return this.btcPriceRes.price;
  }

  get FbSatsPrice() {
    return decimalCal([env.FbPrice, "div", "100000000"]);
  }

  get BtcSatsPrice() {
    return decimalCal([env.BtcPrice, "div", "100000000"]);
  }

  get Brc20SatsPrice() {
    return decimalCal([env.satsPriceRes.price]);
  }

  get FeeRate() {
    return this.feeRate;
  }

  get CurGasPrice() {
    return operator.NewestCommitData.op.gas_price;
  }

  get ModuleInitParams() {
    return builder.ModuleOp.init;
  }

  get Source() {
    return builder.ModuleOp ? builder.ModuleOp.source : config.source;
  }

  get ContractConfig(): ContractConfig {
    return this.config;
  }

  set ContractConfig(config: ContractConfig) {
    this.config = config;
  }

  get Sequencer() {
    return keyring.sequencerWallet.address;
  }

  get Epoch3StartTime() {
    return this.epoch3StartTime;
  }

  get Epoch3EndTime() {
    return this.epoch3EndTime;
  }

  async init() {
    const height = await api.bestHeight();
    need(height > 0 && height !== UNCONFIRM_HEIGHT);
    this.bestHeight = height;

    const info = await api.blockInfo();
    need(info.blocks > 0 && info.blocks !== UNCONFIRM_HEIGHT);
    this.newestHeight = info.blocks - 1;

    this.btcPriceRes = await api.coinmarketcapPriceInfo("sBTC___000");
    this.fbPriceRes = await api.coinmarketcapPriceInfo("sFB___000");
    this.satsPriceRes = await api.coinmarketcapPriceInfo("sSATS___000");

    if (config.simpleBridgeApi) {
      const btcConfig = await api.bridgeConfig(NetworkType.BITCOIN_MAINNET);
      const fbConfig = await api.bridgeConfig(
        NetworkType.FRACTAL_BITCOIN_MAINNET
      );
      env.assetList = [];
      for (let i = 0; i < btcConfig.assetList.length; i++) {
        const item = btcConfig.assetList[i];
        if (item.l2AssetType == "brc20") {
          env.assetList.push({
            ...item,
            l1NetworkType: btcConfig.l1,
            l2NetworkType: btcConfig.l2,
          });
        }
      }
      for (let i = 0; i < fbConfig.assetList.length; i++) {
        const item = fbConfig.assetList[i];
        if (item.l2AssetType == "brc20") {
          env.assetList.push({
            ...item,
            l1NetworkType: fbConfig.l1,
            l2NetworkType: fbConfig.l2,
          });
        }
      }
      console.log("assetList", env.assetList);
    }

    const res = await statusDao.findOne({});
    if (res) {
      this.epoch3StartTime = res.epoch3StartTime || 0;
      this.epoch3EndTime = res.epoch3EndTime || 0;
    }

    await this.updateFeeRate();
  }

  async tick() {
    const height = await api.bestHeight();
    if (height > 0 && height !== UNCONFIRM_HEIGHT) {
      this.bestHeight = height;
    } else {
      logger.error({ tag: TAG, msg: "get best height fail", height });
    }

    const info = await api.blockInfo();
    if (info.blocks > 0 && info.blocks !== UNCONFIRM_HEIGHT) {
      this.newestHeight = info.blocks - 1;
    } else {
      logger.error({ tag: TAG, msg: "get block info fail", info });
    }

    try {
      this.btcPriceRes = await api.coinmarketcapPriceInfo("sBTC___000");
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "btc price update error",
        error: err.message,
      });
    }
    try {
      this.fbPriceRes = await api.coinmarketcapPriceInfo("sFB___000");
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "fb price update error",
        error: err.message,
      });
    }
    try {
      this.satsPriceRes = await api.coinmarketcapPriceInfo("sSATS___000");
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "sats1000 price update error",
        error: err.message,
      });
    }
    logger.info({
      tag: TAG,
      msg: "env-data",
      newestHeight: this.newestHeight,
      bestHeight: this.bestHeight,
      btcPrice: this.btcPriceRes.price,
      fbPrice: this.fbPriceRes,
      satsPrice: this.satsPriceRes.price,
    });

    await this.updateFeeRate();
  }

  async updateFeeRate() {
    const curFeeRate = await api.feeRate();

    const res = await feeRateDao.find({}, { sort: { _id: -1 }, limit: 10 });
    const avgFeeRate = res.length
      ? res.reduce((a, b) => {
          return a + b.feeRate;
        }, 0) / res.length || 0
      : 0;

    this.feeRate = Math.max(curFeeRate, avgFeeRate);

    if (Date.now() - this.lastUpdateFeeRateTime > 30_000) {
      await feeRateDao.insert({
        feeRate: curFeeRate,
        height: this.bestHeight,
        timestamp: Date.now(),
      });
    }
  }
}
