import * as bitcoin from "bitcoinjs-lib";
import { Registry } from "prom-client";
import { config } from "./config";
import { ContractLoader } from "./contract/contract-loader";
import { AddressBalanceDao } from "./dao/address-balance-dao";
import { AssetDao } from "./dao/asset-dao";
import { AssetSupplyDao } from "./dao/asset-supply-dao";
import { OpCommitDao } from "./dao/commit-dao";
import { CommunityDao } from "./dao/community-dao";
import { DepositDao } from "./dao/deposit-dao";
import { OpEventDao } from "./dao/event-dao";
import { FeeRateDao } from "./dao/feerate-dao";
import { LockUserDao } from "./dao/lock-user-dao";
import { LpRewardHistoryDao } from "./dao/lp-reward-history-dao";
import { LpRewardPoolDao } from "./dao/lp-reward-pool-dao";
import { LpRewardUserDao } from "./dao/lp-reward-user-dao";
import { MatchingDao } from "./dao/matching-dao";
import { OpsStatsDao } from "./dao/ops-stats-dao";
import { PayDao } from "./dao/pay-dao";
import { PoolListDao } from "./dao/pool-list-dao";
import { RecordApproveDao } from "./dao/record-approve-dao";
import { RecordGasDao } from "./dao/record-gas-dao";
import { RecordLiqDao } from "./dao/record-liq-dao";
import { RecordLockLpDao } from "./dao/record-lock-lp-dao";
import { RecordMultiSwapDao } from "./dao/record-multi-swap-dao";
import { RecordSendDao } from "./dao/record-send-dao";
import { RecordSwapDao } from "./dao/record-swap-dao";
import { RecordUnlockLpDao } from "./dao/record-unlock-lp-dao";
import { RewardCurveDao } from "./dao/reward-curve-dao";
import { SequencerTxDao } from "./dao/sequencer-tx-dao";
import { SequencerUtxoDao } from "./dao/sequencer-utxo-dao";
import { SnapshotAssetDao } from "./dao/snapshot-asset-dao";
import { SnapshotKLastDao } from "./dao/snapshot-klast-dao";
import { SnapshotSupplyDao } from "./dao/snapshot-supply-dao";
import { StakeEpochDao } from "./dao/stake-epoch-dao";
import { StakeHistoryDao } from "./dao/stake-history-dao";
import { StakePoolDao } from "./dao/stake-pool-dao";
import { StakeUserDao } from "./dao/stake-user-dao";
import { StatusDao } from "./dao/status-dao";
import { TaskDao } from "./dao/task-dao";
import { TaskMetaDao } from "./dao/task-meta-dao";
import { TickDao } from "./dao/tick-dao";
import { WithdrawDao } from "./dao/withdraw-dao";
import { AddressBalanceWorker } from "./domain/address-balance-worker";
import { API } from "./domain/api";
import { Builder } from "./domain/builder";
import { ConditionalWithdraw } from "./domain/conditional-withdraw";
import { BITCOIN_NAME, L1_BITCOIN_NAME } from "./domain/constant";
import { Decimal } from "./domain/decimal";
import { Deposit } from "./domain/deposit";
import { Env } from "./domain/env";
import { Keyring } from "./domain/keyring";
import { LockLp } from "./domain/lock-lp";
import { Matching } from "./domain/matching";
import { Metric } from "./domain/metric";
import { MultiRoutes } from "./domain/multi-routes";
import { Operator } from "./domain/operator";
import { OpsStats } from "./domain/ops-stats";
import { Query } from "./domain/query";
import { RewardCurve } from "./domain/reward-curve";
import { Sender } from "./domain/sender";
import { Stake } from "./domain/stake";
import { StakePoolMgr } from "./domain/stake-pool-mgr";
import { Statistic } from "./domain/statistic";
import { TaskList } from "./domain/task-list";
import { getSatsPrice, need, sysFatal } from "./domain/utils";
import { DirectWithdraw } from "./domain/withdraw";
import { SimpleBridgeApi } from "./lib/bridge-api";
import { OpenApi } from "./lib/open-api";
import { AsyncTimer } from "./utils/async-timer";
import { DateLogger } from "./utils/logger";
import { MongoUtils } from "./utils/mongo-utils";
import { loggerError } from "./utils/utils";

export async function init(launch = true) {
  const networks = {
    testnet: bitcoin.networks.testnet,
    bitcoin: bitcoin.networks.bitcoin,
    regtest: bitcoin.networks.regtest,
  };

  [
    "cors",
    "fixedGasPrice",
    "fixedFeeAmount",
    "port",
    "mongoUrl",
    "network",
    "keyring",
    "startHeight",
    "moduleId",
    "isContractOnChain",
    "pendingTransferNum",
    "pendingDepositDirectNum",
    "pendingDepositMatchingNum",
    "pendingRollupNum",
    "pendingWithdrawNum",
    "insertHeightNum",
    "openCommitPerMinute",
    "commitPerMinute",
    "commitPerSize",
    "eventListPerSize",
    "snapshotPerSize",
    "db",
    "enableApiUTXO",
    "verifyCommit",
    "source",
    "commitFeeRateRatio",
    "userFeeRateRatio",
    "openWhitelistTick",
    "whitelistTick",
    "verifyCommitInvalidException",
    "verifyCommitCriticalException",
    "verifyCommitFatalNum",
    "isLocalTest",
    "binOpts",
    "userWhiteList",
    "onlyUserWhiteList",
    "updateHeight1",
    "initTicks",
    "readonly",
    "minFeeRate",
    "openSwagger",
    "verifyPerOpt",
    "coinmarketcapApi",
    "feeTicks",
    "initiatePoolUpdate",
    "createDbIndex",
    "checkStakePoolBalance",
    "proxyAddress",
    "openHealthyStatus",
    "swapExceptionValue",
    "lpExceptionValue",
    "l1SupplyMap",
  ].forEach((key) => {
    need(config[key] !== undefined, "missing config field: " + key);
  });

  need(config.pendingDepositDirectNum >= 0);
  need(config.pendingDepositMatchingNum >= 0);
  need(config.eventListPerSize > 0);
  need(config.snapshotPerSize > 0);
  need(config.insertHeightNum > 3);
  need(config.insertHeightNum > config.pendingDepositDirectNum);
  need(config.insertHeightNum > config.pendingDepositMatchingNum);
  need(config.insertHeightNum > config.pendingRollupNum);
  need(config.insertHeightNum > config.pendingWithdrawNum);
  if (launch) {
    need(
      [
        "FRACTAL_BITCOIN_MAINNET",
        "BITCOIN_MAINNET",
        "BITCOIN_TESTNET",
        "BITCOIN_TESTNET4",
        "BITCOIN_SIGNET",
        "FRACTAL_BITCOIN_TESTNET",
      ].includes(process.env.BITCOIN_NETWORK)
    );
    need(!!BITCOIN_NAME);
    need(
      [
        "BITCOIN_MAINNET",
        "BITCOIN_TESTNET",
        "BITCOIN_TESTNET4",
        "BITCOIN_SIGNET",
      ].includes(process.env.L1_BITCOIN_NETWORK)
    );
    need(!!L1_BITCOIN_NAME);
  }

  global.inited = false;
  global.config = config;
  global.fatal = false;
  global.network = networks[config.network];
  global.isFractal = [
    "FRACTAL_BITCOIN_MAINNET",
    "FRACTAL_BITCOIN_TESTNET",
  ].includes(process.env.BITCOIN_NETWORK);
  global.isTestnet = ["BITCOIN_TESTNET", "FRACTAL_BITCOIN_TESTNET"].includes(
    process.env.BITCOIN_NETWORK
  );

  console.log("db: ", config.db);
  global.mongoUtils = new MongoUtils(config.mongoUrl, config.db);
  global.decimal = new Decimal();
  global.query = new Query();
  global.env = new Env();
  global.api = new API();
  global.openAPI = new OpenApi(config.openApi);
  if (config.simpleBridgeApi) {
    global.simpleBridgeAPI = new SimpleBridgeApi(config.simpleBridgeApi);
  }
  global.logger = new DateLogger();
  global.contractLoader = new ContractLoader();
  global.deposit = new Deposit();
  global.conditionalWithdraw = new ConditionalWithdraw();
  global.directWithdraw = new DirectWithdraw();
  global.matching = new Matching();
  global.keyring = new Keyring();
  global.metric = new Metric(new Registry());
  global.statistic = new Statistic();
  global.stakePoolMgr = new StakePoolMgr();
  global.stake = new Stake();
  global.opsStats = new OpsStats();
  global.rewardCurve = new RewardCurve();
  global.taskList = new TaskList();
  global.lockLp = new LockLp();
  global.multiRoutes = new MultiRoutes();

  global.operator = new Operator();
  global.sender = new Sender();
  global.builder = new Builder();
  global.addressBalanceWorker = new AddressBalanceWorker();

  global.opCommitDao = new OpCommitDao("commit");
  global.opEventDao = new OpEventDao("event");
  global.tickDao = new TickDao("tick");
  global.recordLiqDao = new RecordLiqDao("record_liq");
  global.recordSwapDao = new RecordSwapDao("record_swap");
  global.recordGasDao = new RecordGasDao("record_gas");
  global.recordApproveDao = new RecordApproveDao("record_approve");
  global.recordSendDao = new RecordSendDao("record_send");
  global.sequencerUtxoDao = new SequencerUtxoDao("sequencer_utxo");
  global.sequencerTxDao = new SequencerTxDao("sequencer_tx");
  global.withdrawDao = new WithdrawDao("withdraw");
  global.matchingDao = new MatchingDao("matching");
  global.depositDao = new DepositDao("deposit");
  global.feeRateDao = new FeeRateDao("feerate");
  global.statusDao = new StatusDao("status");
  global.snapshotAssetDao = new SnapshotAssetDao("snapshot_asset");
  global.snapshotKLastDao = new SnapshotKLastDao("snapshot_klast");
  global.assetDao = new AssetDao("asset");
  global.addressBalanceDao = new AddressBalanceDao("address_balance");
  global.snapshotSupplyDao = new SnapshotSupplyDao("snapshot_supply");
  global.assetSupplyDao = new AssetSupplyDao("asset_supply");
  global.poolListDao = new PoolListDao("pool_list");
  global.stakeEpochDao = new StakeEpochDao("stake_epoch");
  global.stakePoolDao = new StakePoolDao("stake_pool");
  global.stakeUserDao = new StakeUserDao("stake_user");
  global.stakeHistoryDao = new StakeHistoryDao("stake_history");
  global.payDao = new PayDao("pay");
  global.snapshotLpRewardUserDao = new LpRewardUserDao(
    "snapshot_lp_reward_user"
  );
  global.snapshotLpRewardPoolDao = new LpRewardPoolDao(
    "snapshot_lp_reward_pool"
  );
  global.lpRewardHistoryDao = new LpRewardHistoryDao("lp_reward_history");
  global.taskDao = new TaskDao("task");
  global.taskMetaDao = new TaskMetaDao("task_meta");
  global.opsStatsDao = new OpsStatsDao("ops_stats");
  global.communityDao = new CommunityDao("community");
  global.rewardCurveDao = new RewardCurveDao("reward_curve");
  global.recordLockLpDao = new RecordLockLpDao("record_lock_lp");
  global.lockUserDao = new LockUserDao("lock_user");
  global.recordUnlockLpDao = new RecordUnlockLpDao("record_unlock_lp");
  global.recordMultiSwapDao = new RecordMultiSwapDao("record_multi_swap");

  await mongoUtils.init();
  console.log("mongoUtils inited");

  await env.init();
  console.log("env inited");

  await decimal.init();
  console.log("decimal inited");

  await contractLoader.init();
  console.log("contractLoader inited");

  await deposit.init();
  console.log("deposit inited");

  await conditionalWithdraw.init();
  await directWithdraw.init();
  console.log("withdraw inited");

  await stakePoolMgr.init();
  console.log("stakePoolMgr inited");

  await test();

  // init dao data
  if (config.createDbIndex) {
    await createIndexes();
  }
  const status = await global.statusDao.findStatus();
  if (!status?.initedDB) {
    const tmp = config.readonly;
    config.readonly = false;
    await createInitDbData();
    config.readonly = tmp;
  }

  if (launch) {
    // need to init the builder first, and the operator builds a new space based on the builder's history space.
    await builder.init();
    console.log("opBuilder inited");

    await sender.init();
    console.log("opSender inited");

    await operator.init();
    console.log("operator inited");

    const satsPrice = await getSatsPrice();
    console.log("sats price inited: ", satsPrice);

    await query.init();
    console.log("query inited");

    // Initialize address balance worker
    await global.addressBalanceWorker.init(config.initiateUpdateAllBalances);
    console.log("addressBalanceWorker inited");

    await rewardCurve.init();
    console.log("rewardCurve inited");

    // lpMatch doesn't need init, timer is managed in init.ts
    console.log("lpMatch inited");

    await multiRoutes.init();
    console.log("multiRoutes inited");

    global.inited = true;

    const TAG = "tick";

    new AsyncTimer().setInterval(async () => {
      try {
        // The builder needs to remain constant during the update process
        await api.tick();
        await env.tick();

        if (fatal) {
          return;
        }

        logger.debug({ tag: TAG, msg: "directWithdraw" });
        await directWithdraw.tick();
        logger.debug({ tag: TAG, msg: "deposit" });
        await deposit.tick();
        // await matching.tick();
        logger.debug({ tag: TAG, msg: "opBuilder" });
        await builder.tick();
        logger.debug({ tag: TAG, msg: "operator" });
        await operator.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 3_000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        // only refresh utxo, it's safe
        await sender.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 3_000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (fatal) {
          return;
        }
        await query.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 60_000);

    // Separate timer for pool update operations to avoid blocking main tick
    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }

        await query.tick2();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 300_000); // 5 minutes interval for pool updates

    // Timer for address balance worker tick (every 3 seconds)
    new AsyncTimer().setInterval(async () => {
      try {
        if (fatal) {
          return;
        }

        await global.addressBalanceWorker.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 3_000); // 3 seconds interval for address balance updates

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }
        await multiRoutes.init();
      } catch (err) {}
    }, 60_000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }

        await operator.PendingSpace.LpReward.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 120_000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }
        if (!config.openHealthyStatus) {
          return;
        }

        const status = await api.healthyStatus();
        logger.info({ tag: TAG, msg: "healthy status", status });
        if (status.fb_brc20_indexer !== 0) {
          if (status.fb_brc20_indexer == 3) {
            sysFatal({
              tag: TAG,
              msg: "healthy status error: " + status.fb_brc20_indexer,
            });
          }
        }
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 3000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }

        await opsStats.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 1800_000);
  }
}

async function createInitDbData() {
  await statusDao.upsertStatus({
    initedDB: true,
    snapshotLastCommitId: "",
    snapshotLastOpEvent: null,
    confirmedLastOpEvent: null,
    mempoolLastOpEvent: null,
  });
}

async function test() {
  if (!config.openHealthyStatus) {
    return;
  }

  const status = await api.healthyStatus();
  console.log("healthy status: ", status);
}

async function createIndexes() {
  await opCommitDao.createIndex({ inscriptionId: 1 });
  await opCommitDao.createIndex({ "op.parent": 1 });
  await opCommitDao.createIndex({ inEventList: 1 });
  await opCommitDao.createIndex({ "op.data.id": 1 });

  await snapshotKLastDao.createIndex({ tick: 1 });

  await snapshotAssetDao.createIndex({ tick: 1 });
  await snapshotAssetDao.createIndex({ address: 1 });
  await snapshotAssetDao.createIndex({ assetType: 1 });

  await assetDao.createIndex({ cursor: 1 });
  await assetDao.createIndex({ commitParent: 1 });
  await assetDao.createIndex({ tick: 1 });
  await assetDao.createIndex({ address: 1 });
  await assetDao.createIndex({ assetType: 1 });

  await addressBalanceDao.createIndex({ address: 1 });

  await opEventDao.createIndex({ "op.op": 1 });
  await opEventDao.createIndex({ cursor: 1 });

  await tickDao.createIndex({ tick: 1 });

  await recordLiqDao.createIndex({ id: 1 });
  await recordLiqDao.createIndex({ address: 1 });
  await recordLiqDao.createIndex({ tick0: 1 });
  await recordLiqDao.createIndex({ tick1: 1 });
  await recordLiqDao.createIndex({ type: 1 });
  await recordLiqDao.createIndex({ ts: 1 });

  await recordSwapDao.createIndex({ id: 1 });
  await recordSwapDao.createIndex({ address: 1 });
  await recordSwapDao.createIndex({ exactType: 1 });
  await recordSwapDao.createIndex({ tickIn: 1 });
  await recordSwapDao.createIndex({ tickOut: 1 });
  await recordSwapDao.createIndex({ ts: 1 });
  await recordSwapDao.createIndex({ tickIn: 1, tickOut: 1 });

  await recordSendDao.createIndex({ id: 1 });
  await recordSendDao.createIndex({ address: 1 });
  await recordSendDao.createIndex({ tick: 1 });
  await recordSendDao.createIndex({ ts: 1 });
  await recordSendDao.createIndex({ isLp: 1 });

  await recordGasDao.createIndex({ id: 1 });
  await recordGasDao.createIndex({ address: 1 });
  await recordGasDao.createIndex({ ts: 1 });

  await recordApproveDao.createIndex({ id: 1 });
  await recordApproveDao.createIndex({ address: 1 });
  await recordApproveDao.createIndex({ tick: 1 });
  await recordApproveDao.createIndex({ type: 1 });
  await recordApproveDao.createIndex({ ts: 1 });

  await sequencerUtxoDao.createIndex({ status: 1 });
  await sequencerUtxoDao.createIndex({ used: 1 });
  await sequencerUtxoDao.createIndex({ purpose: 1 });

  await sequencerTxDao.createIndex({ status: 1 });
  await sequencerTxDao.createIndex({ txid: 1 });

  await withdrawDao.createIndex({ id: 1 });
  await withdrawDao.createIndex({ address: 1 });
  await withdrawDao.createIndex({ tick: 1 });

  await depositDao.createIndex({ address: 1 });
  await depositDao.createIndex({ tick: 1 });
  await depositDao.createIndex({ inscriptionId: 1 });

  await assetSupplyDao.createIndex({ cursor: 1 });
  await assetSupplyDao.createIndex({ commitParent: 1 });
  await assetSupplyDao.createIndex({ tick: 1 });

  await snapshotSupplyDao.createIndex({ tick: 1 });

  await poolListDao.createIndex({ tick0: 1 });
  await poolListDao.createIndex({ tick1: 1 });
  await poolListDao.createIndex({ tvl: 1 });
  await poolListDao.createIndex({ volume24h: 1 });
  await poolListDao.createIndex({ volume7d: 1 });
  await poolListDao.createIndex({ volume30d: 1 });

  await stakeUserDao.createIndex({ address: 1 });
  await stakeUserDao.createIndex({ pid: 1 });
  await stakeUserDao.createIndex({ tick0: 1 });
  await stakeUserDao.createIndex({ tick1: 1 });

  await stakeHistoryDao.createIndex({ id: 1 });
  await stakeHistoryDao.createIndex({ address: 1 });
  await stakeHistoryDao.createIndex({ pid: 1 });
  await stakeHistoryDao.createIndex({ ts: 1 });
  await stakeHistoryDao.createIndex({ poolTick0: 1 });
  await stakeHistoryDao.createIndex({ poolTick1: 1 });
  await stakeHistoryDao.createIndex({ type: 1 });

  await payDao.createIndex({ address: 1 });

  await snapshotLpRewardUserDao.createIndex({ pair: 1 });
  await snapshotLpRewardUserDao.createIndex({ tick0: 1 });
  await snapshotLpRewardUserDao.createIndex({ tick1: 1 });
  await snapshotLpRewardUserDao.createIndex({ address: 1 });

  await snapshotLpRewardPoolDao.createIndex({ pair: 1 });
  await snapshotLpRewardPoolDao.createIndex({ tick0: 1 });
  await snapshotLpRewardPoolDao.createIndex({ tick1: 1 });

  await lpRewardHistoryDao.createIndex({ id: 1 });
  await lpRewardHistoryDao.createIndex({ tick0: 1 });
  await lpRewardHistoryDao.createIndex({ tick1: 1 });
  await lpRewardHistoryDao.createIndex({ address: 1 });

  await opsStatsDao.createIndex({ timestamp: 1 });

  await rewardCurveDao.createIndex({ pair: 1 });
  await rewardCurveDao.createIndex({ address: 1 });
  await rewardCurveDao.createIndex({ timestamp: 1 });

  await taskDao.createIndex({ tid: 1 });
  await taskDao.createIndex({ address: 1 });
  await taskDao.createIndex({ done: 1 });

  await taskMetaDao.createIndex({ tid: 1 });
  await taskMetaDao.createIndex({ startTime: 1 });
  await taskMetaDao.createIndex({ endTime: 1 });

  await recordLockLpDao.createIndex({ address: 1 });
  await recordLockLpDao.createIndex({ tick0: 1 });
  await recordLockLpDao.createIndex({ tick1: 1 });
  await recordLockLpDao.createIndex({ lockDay: 1 });
  await recordLockLpDao.createIndex({ unlockTime: 1 });
  await recordLockLpDao.createIndex({ ts: 1 });
  await lockUserDao.createIndex({ address: 1 });
  await lockUserDao.createIndex({ tick0: 1 });
  await lockUserDao.createIndex({ tick1: 1 });
  await recordUnlockLpDao.createIndex({ address: 1 });
  await recordUnlockLpDao.createIndex({ tick0: 1 });
  await recordUnlockLpDao.createIndex({ tick1: 1 });
  await recordUnlockLpDao.createIndex({ ts: 1 });
}
