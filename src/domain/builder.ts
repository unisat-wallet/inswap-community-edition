import hash from "object-hash";
import { exit } from "process";
import { allAssetType } from "../contract/assets";
import { bnDecimal } from "../contract/bn";
import { DepositData } from "../dao/deposit-dao";
import { EventType, InscriptionEventsRes } from "../types/api";
import { ContractResult } from "../types/func";
import {
  CommitOp,
  ConditionalApproveOp,
  ModuleOp,
  OpEvent,
  OpType,
  TransferOp,
} from "../types/op";
import { LP_DECIMAL, PENDING_CURSOR, UNCONFIRM_HEIGHT } from "./constant";
import { convertFuncInscription2Internal } from "./convert-struct";
import { internal_server_error } from "./error";
import { Space, SpaceType } from "./space";
import {
  apiEventToOpEvent,
  getConfirmedNum,
  getSnapshotObjFromDao,
  isLp,
  need,
  record,
  sysFatal,
} from "./utils";

const TAG = "builder";

export type AssetProcessingData = {
  cursor: number;
  height: number;
  commitParent?: string;
  displayBalance: string;
  opType: OpType;
};

export class Builder {
  private lastHandledHeight = 0;

  /**
   * events stream (chain):
   * -=-= snapshot -=-=|-=-= confirmed -=-=|-=-= mempool -=-=|-=-= pending -=-=
   */
  private snapshotSpace: Space;
  private confirmedSpace: Space;
  private mempoolSpace: Space;

  private snapshotToConfirmedHash: number;
  private confirmedToMempoolHash: number;
  private moduleOp: ModuleOp;

  private isResetPendingSpace = true;
  private needResetPendingSpace = true;

  get ModuleOp() {
    return this.moduleOp;
  }

  get IsResetPendingSpace() {
    return this.isResetPendingSpace;
  }

  get SnapshotSpaceCursor() {
    return this.snapshotSpace?.LastHandledApiEvent?.cursor || 0;
  }

  get ConfirmedSpaceCursor() {
    return this.confirmedSpace?.LastHandledApiEvent?.cursor || 0;
  }

  get MempoolSpaceCursor() {
    return this.mempoolSpace?.LastHandledApiEvent?.cursor || 0;
  }

  get MempoolSpace() {
    return this.mempoolSpace;
  }

  get SnapshotSpace() {
    return this.snapshotSpace;
  }

  get ConfirmedSpace() {
    return this.confirmedSpace;
  }

  constructor() {}

  async calculateHash(cursor: number, size: number) {
    if (size <= 0) {
      return null;
    }
    need(size < 10000, "size too big");
    const res = await api.eventRawList({
      moduleId: config.moduleId,
      cursor,
      size,
    });
    return hash(res.detail);
  }

  async init() {
    const res = await api.eventRawList({
      moduleId: config.moduleId,
      cursor: 0,
      size: 1,
    });
    if (res.detail.length == 0) {
      console.log(`Module: ${config.moduleId} not found`);
      exit(1);
    }
    const opEvent = await apiEventToOpEvent(res.detail[0], 0);
    if (!opEvent || opEvent.op.op !== OpType.deploy) {
      console.log(`Module: ${config.moduleId} not found`);
      exit(1);
    }
    console.log(`Module: ${config.moduleId}`);
    this.moduleOp = opEvent.op;

    const status = await statusDao.findStatus();
    const snapshot = await getSnapshotObjFromDao();
    this.snapshotSpace = new Space(
      snapshot,
      env.ContractConfig,
      status.snapshotLastCommitId,
      status.snapshotLastOpEvent,
      true, // note
      SpaceType.snapshot
    );

    let hasNext = false;
    if (!config.skipRebuild) {
      const start = Date.now();
      do {
        console.log("rebuild from cursor: ", this.SnapshotSpaceCursor);
        hasNext = await this.move({
          updateSnapshotSpace: true,
          updateConfirmedSpace: false,
          updateMempoolSpace: false,
          startCursor: this.SnapshotSpaceCursor + 1,
        });
      } while (hasNext);
      console.log("rebuild success!, time: ", Date.now() - start);
    }

    await this.restoreEventDao();
    console.log("restore event success!");

    await this.updateAllSpace(true);
  }

  private async restoreEventDao() {
    const status = await statusDao.findStatus();
    let cursor = status.confirmedLastOpEvent?.cursor || 1;

    // init asset dao
    if (cursor == 1) {
      const assetRes = await snapshotAssetDao.find({});
      const suppltRes = await snapshotSupplyDao.find({});

      for (let i = 0; i < assetRes.length; i++) {
        const item = assetRes[i];
        let tickDecimal: string;
        if (isLp(item.tick)) {
          tickDecimal = LP_DECIMAL;
        } else {
          tickDecimal = decimal.get(item.tick);
        }
        await assetDao.upsertData({
          height: UNCONFIRM_HEIGHT,
          cursor: PENDING_CURSOR,
          commitParent: "",
          displayBalance: bnDecimal(item.balance, tickDecimal),
          ...item,
        });
      }

      for (let i = 0; i < suppltRes.length; i++) {
        const item = suppltRes[i];
        await assetSupplyDao.upsertData({
          height: UNCONFIRM_HEIGHT,
          cursor: PENDING_CURSOR,
          commitParent: "",
          ...item,
        });
      }
    }

    let res: InscriptionEventsRes;
    logger.debug({ tag: TAG, msg: "restore event begin", start: cursor });
    do {
      res = await api.eventRawList({
        moduleId: config.moduleId,
        cursor,
        size: config.eventListPerSize,
      });
      for (let i = 0; i < res.detail.length; i++) {
        const event = await apiEventToOpEvent(res.detail[i], cursor);
        if (event.valid) {
          await opEventDao.upsertData(event);
          await this.updateDepositData(event);
          if (event.op.op == OpType.commit) {
            await opCommitDao.updateOne(
              { txid: event.txid },
              { $set: { inEventList: true } }
            );
          }
          // await this.updateRecord(event, res);
        }
        cursor++;
      }
    } while (res.detail.length >= config.eventListPerSize);
    logger.debug({ tag: TAG, msg: "restore event end", end: cursor });
  }

  private async updateRecord(opEvent: OpEvent, res: ContractResult[]) {
    if (opEvent.event == EventType.commit) {
      const op = opEvent.op as CommitOp;
      for (let i = 0; i < op.data.length; i++) {
        let item;
        try {
          item = convertFuncInscription2Internal(i, op, opEvent.height);
          await record(opEvent.inscriptionId, item, res[i]);
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "record error",
            stack: err.stack,
            error: err.message,
            i,
            op,
            opEvent,
            item,
          });
          throw err;
        }
      }

      await opCommitDao.updateInEventList(
        opEvent.inscriptionId,
        opEvent.height
      );
    }
  }

  private async updateDepositData(opEvent: OpEvent) {
    if (opEvent.event == EventType.transfer) {
      const op = opEvent.op as TransferOp;
      const data: DepositData = {
        cursor: opEvent.cursor,
        address: opEvent.from,
        inscriptionId: opEvent.inscriptionId,
        height: opEvent.height,
        ts: opEvent.blocktime,
        txid: opEvent.txid,
        tick: op.tick,
        amount: op.amt,
        type: "direct",
      };
      await depositDao.upsertDataByInscriptionId(data);
    } else if (opEvent.event == EventType.conditionalApprove) {
      // not cancel withdraw
      if (opEvent.data.transfer) {
        const op = opEvent.op as ConditionalApproveOp;
        const data: DepositData = {
          cursor: opEvent.cursor,
          address: opEvent.to,
          inscriptionId: opEvent.data.transfer,
          height: opEvent.height,
          ts: opEvent.blocktime,
          txid: opEvent.txid,
          tick: op.tick,
          amount: opEvent.data.transferMax,
          type: "matching",
        };
        await depositDao.upsertDataByInscriptionId(data);
      }
    }
  }

  async move(params: {
    updateSnapshotSpace: boolean;
    updateConfirmedSpace: boolean;
    updateMempoolSpace: boolean;
    startCursor: number;
  }) {
    const startTime = Date.now();
    const {
      startCursor,
      updateSnapshotSpace,
      updateConfirmedSpace,
      updateMempoolSpace,
    } = params;

    const res = await api.eventRawList({
      moduleId: config.moduleId,
      cursor: startCursor,
      size: config.eventListPerSize,
    });

    logger.debug({
      tag: TAG,
      msg: "move-begin",
      cursor: startCursor,
      length: res.detail.length,
      total: res.total,
    });

    let moveMempoolSpaceCursor = false;
    let moveConfirmedSpaceCursor = false;
    let moveSnapshotSpaceCursor = false;

    /*****************************************************************
     * Update space
     *****************************************************************/
    let preHeight = res.detail[0]?.height;
    for (let i = 0; i < res.detail.length; i++) {
      const event = await apiEventToOpEvent(res.detail[i], startCursor + i);
      // check open api
      need(event.height >= preHeight, null, null, true);

      if (updateSnapshotSpace) {
        // udpate snapshot space
        if (getConfirmedNum(event.height) > config.insertHeightNum) {
          try {
            const res = this.snapshotSpace.handleEvent(event, null, true);
            await this.updateRecord(event, res);
          } catch (err) {
            sysFatal({
              tag: TAG,
              msg: "snapshot space update error",
              error: err.message,
              stack: err.stack,
              event,
            });
          }
          moveSnapshotSpaceCursor = true;
        }
      }

      // update confirmed space
      if (updateConfirmedSpace) {
        if (getConfirmedNum(event.height) > 0) {
          const res = this.confirmedSpace.handleEvent(
            event,
            /*2*/ (item) => {
              let commitParent: string;
              if (event.op.op == OpType.commit) {
                commitParent = event.op.parent;
              }
              const cursor = event.cursor;
              const height = event.height;
              const opType = event.op.op;

              let tickDecimal: string;
              if (isLp(item.raw.tick)) {
                tickDecimal = LP_DECIMAL;
              } else {
                tickDecimal = decimal.get(item.raw.tick);
              }
              (item.processing as AssetProcessingData) = {
                cursor,
                height,
                displayBalance: bnDecimal(item.raw.balance, tickDecimal),
                commitParent,
                opType,
              };
            },
            true
          );
          moveConfirmedSpaceCursor = true;

          if (event.valid) {
            await opEventDao.upsertData(event);
            await this.updateDepositData(event);
            await this.updateRecord(event, res);
            await statusDao.upsertStatus({
              confirmedLastOpEvent: this.confirmedSpace.LastHandledApiEvent,
            });
          }
        }
      }

      if (updateMempoolSpace) {
        /****************************************
         * collector processing:
         * 1. collect data
         * 2. data processing (option)
         * 3. cursor++
         ****************************************/

        this.mempoolSpace.handleEvent(
          event,
          /*2*/ (item) => {
            let commitParent: string;
            if (event.op.op == OpType.commit) {
              commitParent = event.op.parent;
            }
            const cursor = event.cursor;
            const height = event.height;
            const opType = event.op.op;

            let tickDecimal: string;
            if (isLp(item.raw.tick)) {
              tickDecimal = LP_DECIMAL;
            } else {
              tickDecimal = decimal.get(item.raw.tick);
            }
            (item.processing as AssetProcessingData) = {
              cursor,
              height,
              displayBalance: bnDecimal(item.raw.balance, tickDecimal),
              commitParent,
              opType,
            };
          },
          true
        );
        moveMempoolSpaceCursor = true;

        // Collect addresses for balance update from MempoolSpace updates
        try {
          if (global.addressBalanceWorker && event.valid) {
            // Collect addresses from all event types
            const addressesToCollect: string[] = [];

            // Add from/to addresses from the event
            if (event.from) {
              addressesToCollect.push(event.from);
            }
            if (event.to) {
              addressesToCollect.push(event.to);
            }

            // For commit events, analyze addresses from function data (similar to operator logic)
            if (
              event.op &&
              event.op.op === OpType.commit &&
              "data" in event.op
            ) {
              const commitOp = event.op as CommitOp;
              if (commitOp.data) {
                commitOp.data.forEach((funcData) => {
                  // Add the function's address
                  if (funcData.addr) {
                    addressesToCollect.push(funcData.addr);
                  }

                  // Analyze params to find additional addresses
                  if (funcData.params && Array.isArray(funcData.params)) {
                    funcData.params.forEach((param) => {
                      if (this.isValidAddress(param)) {
                        addressesToCollect.push(param);
                      }
                    });
                  }
                });
              }
            }

            // Collect all unique addresses
            const uniqueAddresses = Array.from(new Set(addressesToCollect));
            uniqueAddresses.forEach((address) => {
              if (address) {
                global.addressBalanceWorker.collectAddress(address);
              }
            });
          }
        } catch (error) {
          // Log error but don't fail the operation
          console.warn(
            "Failed to collect addresses from MempoolSpace update:",
            error
          );
        }

        if (event.valid) {
          await opEventDao.upsertData(event);
          await this.updateDepositData(event);
          if (event.op.op == OpType.commit) {
            await opCommitDao.updateOne(
              { txid: event.txid },
              { $set: { inEventList: true } }
            );
          }
        }
      }

      if (moveMempoolSpaceCursor && !this.needResetPendingSpace) {
        await operator.handleEvent(event, false);
      }
    }

    /*****************************************************************
     * Update snapshot
     *****************************************************************/
    if (moveSnapshotSpaceCursor) {
      const preSnapshotSpaceCursor =
        this.snapshotSpace.NotifyDataCollector.StartCursor;
      if (
        this.SnapshotSpaceCursor - preSnapshotSpaceCursor >
        config.snapshotPerSize
      ) {
        try {
          await mongoUtils.startTransaction(async (session) => {
            const assetList = this.snapshotSpace.NotifyDataCollector.AssetList;
            const klistList = this.snapshotSpace.NotifyDataCollector.KlastList;
            const tickSet: Set<string> = new Set();
            for (let i = 0; i < assetList.length; i++) {
              const item = assetList[i];
              await snapshotAssetDao.upsertData(item.raw, { session });
              tickSet.add(item.raw.tick);
            }
            for (let i = 0; i < klistList.length; i++) {
              const item = klistList[i];
              await snapshotKLastDao.upsertData(
                {
                  tick: item.raw.tick,
                  value: item.raw.k,
                },
                { session }
              );
              const pool = this.snapshotSpace.LpReward.PoolMap[item.raw.tick];
              const user =
                this.snapshotSpace.LpReward.UserMap[item.raw.tick][
                  item.raw.address
                ];

              await snapshotLpRewardPoolDao.upsertData(pool, { session });
              await snapshotLpRewardUserDao.upsertData(user, { session });
            }

            for (let i = 0; i < allAssetType.length; i++) {
              const assetType = allAssetType[i];
              for (const tick of tickSet) {
                await snapshotSupplyDao.upsertData(
                  {
                    tick,
                    assetType,
                    supply:
                      this.snapshotSpace.Assets.dataRefer()[assetType][tick]
                        ?.Supply || "0",
                  },
                  { session }
                );
              }
            }
            await statusDao.upsertStatus(
              {
                snapshotLastCommitId: this.snapshotSpace.LastCommitId,
                snapshotLastOpEvent: this.snapshotSpace.LastHandledApiEvent,
              },
              { session }
            );
          });
          this.snapshotSpace.NotifyDataCollector.reset(
            this.SnapshotSpaceCursor
          );
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "snapshot-update-fail",
            error: err.message,
            stack: err.stack,
            snapshotSpaceCursor: this.SnapshotSpaceCursor,
            preSnapshotSpaceCursor,
          });
        }
      }
    }

    /*****************************************************************
     * Update asset
     *****************************************************************/
    if (moveConfirmedSpaceCursor) {
      try {
        await mongoUtils.startTransaction(async (session) => {
          const assetList = this.confirmedSpace.NotifyDataCollector.AssetList;
          for (let i = 0; i < assetList.length; i++) {
            const item = assetList[i];
            const processing = item.processing as AssetProcessingData;
            await assetDao.upsertData(
              {
                assetType: item.raw.assetType,
                tick: item.raw.tick,
                address: item.raw.address,
                balance: item.raw.balance,
                cursor: processing.cursor,
                height: processing.height,
                commitParent: processing.commitParent,
                displayBalance: processing.displayBalance,
              },
              { session }
            );
            await assetSupplyDao.upsertData(
              {
                cursor: processing.cursor,
                height: processing.height,
                commitParent: processing.commitParent,
                tick: item.raw.tick,
                assetType: item.raw.assetType,
                supply:
                  this.confirmedSpace.Assets.dataRefer()[item.raw.assetType][
                    item.raw.tick
                  ]?.Supply || "0",
              },
              { session }
            );
          }
          await statusDao.upsertStatus(
            {
              confirmedLastOpEvent: this.confirmedSpace.LastHandledApiEvent,
            },
            { session }
          );
        });
        this.confirmedSpace.NotifyDataCollector.reset(
          this.confirmedSpace.LastHandledApiEvent.cursor
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "asset-update-fail-1",

          error: err.message,
          stack: err.stack,
        });
      }
    }

    if (moveMempoolSpaceCursor) {
      try {
        await mongoUtils.startTransaction(async (session) => {
          const assetList = this.mempoolSpace.NotifyDataCollector.AssetList;
          for (let i = 0; i < assetList.length; i++) {
            const item = assetList[i];
            const processing = item.processing as AssetProcessingData;
            await assetDao.upsertData(
              {
                assetType: item.raw.assetType,
                tick: item.raw.tick,
                address: item.raw.address,
                balance: item.raw.balance,
                cursor: processing.cursor,
                height: processing.height,
                commitParent: processing.commitParent,
                displayBalance: processing.displayBalance,
              },
              { session }
            );
            await assetSupplyDao.upsertData(
              {
                cursor: processing.cursor,
                height: processing.height,
                commitParent: processing.commitParent,
                tick: item.raw.tick,
                assetType: item.raw.assetType,
                supply:
                  this.mempoolSpace.Assets.dataRefer()[item.raw.assetType][
                    item.raw.tick
                  ]?.Supply || "0",
              },
              { session }
            );
          }
          await statusDao.upsertStatus(
            {
              mempoolLastOpEvent: this.mempoolSpace.LastHandledApiEvent,
            },
            { session }
          );
        });
        this.mempoolSpace.NotifyDataCollector.reset(
          this.mempoolSpace.LastHandledApiEvent.cursor
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "asset-update-fail-4",

          error: err.message,
          stack: err.stack,
        });
      }
    }

    /*****************************************************************
     * Update hash
     *****************************************************************/
    if (moveSnapshotSpaceCursor || moveConfirmedSpaceCursor) {
      this.snapshotToConfirmedHash = await this.calculateHash(
        this.SnapshotSpaceCursor,
        this.ConfirmedSpaceCursor - this.SnapshotSpaceCursor + 1
      );
    }
    if (moveConfirmedSpaceCursor || moveMempoolSpaceCursor) {
      this.confirmedToMempoolHash = await this.calculateHash(
        this.ConfirmedSpaceCursor,
        this.MempoolSpaceCursor - this.ConfirmedSpaceCursor + 1
      );
    }

    const hasNext = res.detail.length == config.eventListPerSize;

    const ht = Date.now() - startTime;
    logger.debug({ tag: TAG, msg: "move-end", ht });
    return hasNext;
  }

  private __hasReorgSize;
  async hasReorg() {
    if (
      !this.snapshotToConfirmedHash ||
      this.SnapshotSpaceCursor == this.ConfirmedSpaceCursor
    ) {
      return false;
    }
    const size = this.ConfirmedSpaceCursor - this.SnapshotSpaceCursor + 1;
    const hash = await this.calculateHash(this.SnapshotSpaceCursor, size);
    const oldHash = this.confirmedToMempoolHash;
    const ret =
      hash !== oldHash && this.__hasReorgSize && size == this.__hasReorgSize;
    this.__hasReorgSize = size;
    return ret;
  }

  private __hasUnconfirmedDiscordSize;
  async hasUnconfirmedDiscord() {
    if (
      !this.confirmedToMempoolHash ||
      this.ConfirmedSpaceCursor == this.MempoolSpaceCursor
    ) {
      return false;
    }
    const size = this.MempoolSpaceCursor - this.ConfirmedSpaceCursor + 1;
    const hash = await this.calculateHash(this.ConfirmedSpaceCursor, size);
    const oldHash = this.confirmedToMempoolHash;
    const ret =
      hash !== oldHash &&
      this.__hasUnconfirmedDiscordSize &&
      this.__hasUnconfirmedDiscordSize == size;
    this.__hasUnconfirmedDiscordSize = size;
    return ret;
  }

  async updateMempoolSpace() {
    logger.debug({
      tag: TAG,
      msg: "updateMempool",
      snapshotSpaceCursor: this.SnapshotSpaceCursor,
      confirmedSpaceCursor: this.ConfirmedSpaceCursor,
      mempoolSpaceCursor: this.MempoolSpaceCursor,
    });
    await this.move({
      updateSnapshotSpace: false,
      updateConfirmedSpace: false,
      updateMempoolSpace: true,
      startCursor: this.MempoolSpaceCursor + 1,
    });
  }

  async updateSnapshotSpace() {
    logger.debug({
      tag: TAG,
      msg: "updateSnapshot",
      snapshotSpaceCursor: this.SnapshotSpaceCursor,
      confirmedSpaceCursor: this.ConfirmedSpaceCursor,
      mempoolSpaceCursor: this.MempoolSpaceCursor,
    });
    await this.move({
      updateSnapshotSpace: true,
      updateConfirmedSpace: false,
      updateMempoolSpace: false,
      startCursor: this.SnapshotSpaceCursor + 1,
    });
  }

  async updateConfirmedSpace() {
    logger.debug({
      tag: TAG,
      msg: "updateConfirmed",
      snapshotSpaceCursor: this.SnapshotSpaceCursor,
      confirmedSpaceCursor: this.ConfirmedSpaceCursor,
      mempoolSpaceCursor: this.MempoolSpaceCursor,
      lastHandledHeight: this.lastHandledHeight,
    });
    await this.move({
      updateSnapshotSpace: false,
      updateConfirmedSpace: true,
      updateMempoolSpace: false,
      startCursor: this.ConfirmedSpaceCursor + 1,
    });
  }

  private resetSpace(spaceType: SpaceType, from: Space) {
    logger.debug({
      tag: TAG,
      msg: "reset space",
      space: spaceType,
      from: from.SpaceType,
    });
    if (spaceType == SpaceType.snapshot) {
      throw new Error(internal_server_error);
    } else if (spaceType == SpaceType.confirmed) {
      this.confirmedSpace = new Space(
        from.snapshot(),
        env.ContractConfig,
        from.LastCommitId,
        from.LastHandledApiEvent,
        true,
        SpaceType.confirmed
      );
    } else if (spaceType == SpaceType.mempool) {
      this.mempoolSpace = new Space(
        from.snapshot(),
        env.ContractConfig,
        from.LastCommitId,
        from.LastHandledApiEvent,
        true,
        SpaceType.mempool
      );
    } else {
      throw new Error(internal_server_error);
    }
  }

  private async updateAllSpace(forceResetFromSnapshotSpace: boolean) {
    this.needResetPendingSpace = false;

    // determine whether to reset the cursor
    if (forceResetFromSnapshotSpace) {
      this.needResetPendingSpace = true;
      this.resetSpace(SpaceType.confirmed, this.snapshotSpace);
      this.resetSpace(SpaceType.mempool, this.snapshotSpace);
    } else {
      const blockHeight = await api.bestHeight();

      // handle reorg
      if (blockHeight !== this.lastHandledHeight) {
        this.lastHandledHeight = blockHeight;
        if (await this.hasReorg()) {
          this.needResetPendingSpace = true;
          this.resetSpace(SpaceType.confirmed, this.snapshotSpace);
          this.resetSpace(SpaceType.mempool, this.snapshotSpace);
        }
      }
    }

    // handle mempool discard
    if (await this.hasUnconfirmedDiscord()) {
      this.needResetPendingSpace = true;
      this.resetSpace(SpaceType.mempool, this.confirmedSpace);
    }

    // update space
    await this.updateSnapshotSpace();
    await this.updateConfirmedSpace();
    await this.updateMempoolSpace();

    if (this.needResetPendingSpace) {
      this.isResetPendingSpace = true;
      await operator.resetPendingSpace(this.mempoolSpace);
      this.isResetPendingSpace = false;
    }
  }

  forceReset = false;
  private retryCount = 0;
  async tick() {
    logger.debug({ tag: TAG, msg: "builder tick" });

    // idempotent
    try {
      logger.debug({
        tag: TAG,
        msg: "update space",
        forceReset: this.forceReset,
        retryCount: this.retryCount,
      });
      await this.updateAllSpace(this.forceReset);
      this.forceReset = false;
      this.retryCount = 0;
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "update space error",
        error: err.message,
        stack: err.stack,
      });
      this.forceReset = true;
      this.retryCount++;

      // Do not throw exceptions, as it may affect the execution of the operator
      // throw err;
    }
  }

  /**
   * Check if a string is a valid Bitcoin address
   * @param str The string to check
   * @returns True if the string looks like a Bitcoin address
   */
  private isValidAddress(str: string): boolean {
    if (!str || typeof str !== "string") {
      return false;
    }

    // Basic Bitcoin address validation patterns
    // P2PKH addresses start with 1, P2SH with 3, P2WPKH/P2WSH with bc1
    const addressPattern =
      /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/;

    return addressPattern.test(str);
  }
}
