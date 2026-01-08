import { bnDecimal, decimalCal } from "../contract/bn";
import { AddressBalanceData } from "../dao/address-balance-dao";
import {
  AllAddressBalanceReq,
  AllAddressBalanceRes,
  AssetType,
  NetworkType,
  SwapAssetItem,
} from "../types/route";
import { ZERO_ADDRESS } from "./constant";
import { isLp } from "./utils";

// Address update queue item
interface AddressUpdateItem {
  address: string;
  lastUpdateTime: number;
  updateCount: number;
}

export class AddressBalanceWorker {
  private updateQueue: Map<string, AddressUpdateItem> = new Map();
  private readonly UPDATE_INTERVAL_MS =
    config.balanceWorker?.updateIntervalMs || 2 * 60 * 1000; // 2 minutes
  private readonly MAX_UPDATE_COUNT = config.balanceWorker?.maxUpdateCount || 5;
  private readonly CONCURRENT_LIMIT =
    config.balanceWorker?.concurrentLimit || 50; // Max concurrent updates
  private cachedMap: { [brc20Tick: string]: SwapAssetItem };

  /**
   * Initialize the worker
   * @param initiateUpdateAllBalances Whether to update all address balances on startup
   */
  async init(initiateUpdateAllBalances?: boolean): Promise<void> {
    if (initiateUpdateAllBalances) {
      global.logger.info({
        tag: "AddressBalanceWorker.init",
        msg: "Starting initial update of all address balances...",
      });

      try {
        await this.updateAllAddressesBalance();
        global.logger.info({
          tag: "AddressBalanceWorker.init",
          msg: "Initial update of all address balances completed",
        });
      } catch (error) {
        global.logger.error({
          tag: "AddressBalanceWorker.init",
          msg: "Failed to perform initial update of all address balances",
          error,
        });
      }
    }
  }

  /**
   * Collect address for balance update
   * @param address The address to collect
   */
  collectAddress(address: string): void {
    if (!address) return;

    const existing = this.updateQueue.get(address);
    if (existing) {
      // Reset update count and last update time for immediate update
      existing.updateCount = 0;
      existing.lastUpdateTime = 0;
    } else {
      // Add new address to queue
      this.updateQueue.set(address, {
        address,
        lastUpdateTime: 0,
        updateCount: 0,
      });
    }

    global.logger.debug({
      tag: "AddressBalanceWorker.collectAddress",
      msg: `Address ${address} collected for balance update`,
    });

    this.updateAddressBalance(address).catch((error) => {
      global.logger.error({
        tag: "AddressBalanceWorker.collectAddress",
        msg: `Failed to update balance for address ${address}`,
        error,
      });
    });
  }

  async getTickInfo(
    tick: string
  ): Promise<{ assetType: AssetType; networkType: NetworkType }> {
    if (!this.cachedMap) {
      const data = await global.query.getSelectDeposit({
        address: ZERO_ADDRESS,
        pubkey: "",
        v: "2",
      });
      const brc20Map: { [brc20Tick: string]: SwapAssetItem } = {};
      let list: SwapAssetItem[] = [];
      list = list
        .concat(data.fractal.brc20)
        .concat(data.fractal.native)
        .concat(data.fractal.runes) // seq is important
        .concat(data.bitcoin.brc20)
        .concat(data.bitcoin.native)
        .concat(data.bitcoin.runes)
        .concat(data.bitcoin.alkanes);
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        brc20Map[item.brc20Tick] = item;
      }
      this.cachedMap = brc20Map;
      logger.debug({
        tag: "AddressBalanceWorker.getTickInfo",
        msg: "Cached map updated",
        cachedMap: this.cachedMap,
      });
    }
    return {
      assetType: this.cachedMap[tick]?.assetType || "brc20",
      networkType:
        this.cachedMap[tick]?.networkType ||
        (process.env.BITCOIN_NETWORK as NetworkType),
    };
  }

  /**
   * Update balance for a specific address
   * @param address The address to update
   */
  async updateAddressBalance(address: string): Promise<void> {
    const req: AllAddressBalanceReq = { address, pubkey: "" };
    const res = await global.assetDao.find({ address: req.address });
    const balance: AllAddressBalanceRes = {};

    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      if (isLp(item.tick)) {
        continue;
      }

      const tickInfo = await this.getTickInfo(item.tick);
      if (!balance[item.tick]) {
        balance[item.tick] = {
          balance: {
            module: "0",
            swap: "0",
            pendingSwap: "0",
            pendingAvailable: "0",
          },
          decimal: global.decimal.get(item.tick),
          assetType: tickInfo.assetType,
          networkType: tickInfo.networkType,
        };
      }
      balance[item.tick].balance[item.assetType] = bnDecimal(
        operator.PendingSpace.Assets.get(
          item.tick,
          item.assetType as any
        ).balanceOf(address),
        global.decimal.get(item.tick)
      );

      if (i == res.length - 1) {
        balance[item.tick].balance["module"] = decimalCal(
          [
            balance[item.tick].balance["available"] || "0",
            "add",
            balance[item.tick].balance["approve"] || "0",
            "add",
            balance[item.tick].balance["conditionalApprove"] || "0",
          ],
          global.decimal.get(item.tick)
        );
        delete balance[item.tick].balance["available"];
        delete balance[item.tick].balance["approve"];
        delete balance[item.tick].balance["conditionalApprove"];
      }
    }

    for (let tick in balance) {
      if (
        balance[tick].balance["module"] == "0" &&
        balance[tick].balance["swap"] == "0" &&
        balance[tick].balance["pendingSwap"] == "0" &&
        balance[tick].balance["pendingAvailable"] == "0"
      ) {
        delete balance[tick];
      }
    }

    await global.addressBalanceDao.upsertAddressBalance({ address, balance });
  }

  /**
   * Update balance for all addresses
   */
  async updateAllAddressesBalance(): Promise<void> {
    try {
      // Get all addresses
      const allAssets = await global.assetDao.aggregate([
        { $group: { _id: "$address" } },
        { $project: { address: "$_id", _id: 0 } },
      ]);
      const addresses = allAssets.map((item) => item.address);

      global.logger.info({
        tag: "AddressBalanceWorker.updateAllAddressesBalance",
        msg: `Starting to update balance for ${addresses.length} addresses...`,
      });

      // Update balance for each address
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        try {
          await this.updateAddressBalance(address);
          if ((i + 1) % 100 === 0) {
            global.logger.info({
              tag: "AddressBalanceWorker.updateAllAddressesBalance",
              msg: `Updated ${i + 1}/${addresses.length} addresses`,
            });
          }
        } catch (error) {
          global.logger.error({
            tag: "AddressBalanceWorker.updateAllAddressesBalance",
            msg: `Failed to update balance for address ${address}`,
            error,
          });
        }
      }

      global.logger.info({
        tag: "AddressBalanceWorker.updateAllAddressesBalance",
        msg: `All address balance updates completed. Total updated: ${addresses.length} addresses`,
      });
    } catch (error) {
      global.logger.error({
        tag: "AddressBalanceWorker.updateAllAddressesBalance",
        msg: "Failed to update all address balances",
        error,
      });
      throw error;
    }
  }

  /**
   * Get address balance from cache table
   * @param address The address to query
   * @returns Balance data for the address
   */
  async getAddressBalance(address: string): Promise<AddressBalanceData | null> {
    return await global.addressBalanceDao.findAddressBalance(address);
  }

  /**
   * Get all balance data for an address
   * @param address The address to query
   * @returns All balance data for the address
   */
  async getAddressAllBalances(
    address: string
  ): Promise<AddressBalanceData | null> {
    return await global.addressBalanceDao.findAddressBalance(address);
  }

  /**
   * Tick method for batch updating address balances
   * Should be called every 3 seconds
   */
  async tick(): Promise<void> {
    const now = Date.now();
    const addressesToUpdate: string[] = [];

    // Collect addresses that need updating
    for (const [address, item] of Array.from(this.updateQueue.entries())) {
      if (now - item.lastUpdateTime > this.UPDATE_INTERVAL_MS) {
        addressesToUpdate.push(address);
      }
    }

    if (addressesToUpdate.length === 0) {
      return;
    }

    global.logger.info({
      tag: "AddressBalanceWorker.tick",
      msg: `Starting batch update for ${addressesToUpdate.length} addresses (concurrent limit: ${this.CONCURRENT_LIMIT})`,
      addressesToUpdate,
    });

    // Update addresses concurrently with concurrency limit
    const updatePromises = addressesToUpdate.map(
      (address) => () => this.updateAddressBalanceWithQueueUpdate(address, now)
    );

    // Process in batches to respect concurrency limit
    const results = await this.processConcurrently(
      updatePromises,
      this.CONCURRENT_LIMIT
    );

    // Log results
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    global.logger.info({
      tag: "AddressBalanceWorker.tick",
      msg: `Batch update completed. Success: ${successCount}, Failed: ${failureCount}, Queue size: ${this.updateQueue.size}`,
    });
  }

  /**
   * Update address balance and update queue item
   * @param address The address to update
   * @param now Current timestamp
   */
  private async updateAddressBalanceWithQueueUpdate(
    address: string,
    now: number
  ): Promise<{ success: boolean; address: string }> {
    try {
      await this.updateAddressBalance(address);

      // Update queue item
      const item = this.updateQueue.get(address);
      if (item) {
        item.lastUpdateTime = now;
        item.updateCount++;

        // Remove address if it has been updated 5 times
        if (item.updateCount >= this.MAX_UPDATE_COUNT) {
          this.updateQueue.delete(address);
          global.logger.info({
            tag: "AddressBalanceWorker.tick",
            msg: `Address ${address} removed from update queue after ${item.updateCount} updates`,
          });
        }
      }

      return { success: true, address };
    } catch (error) {
      global.logger.error({
        tag: "AddressBalanceWorker.tick",
        msg: `Failed to update balance for address ${address}: ${error.message}`,
        stack: error.stack,
      });
      return { success: false, address };
    }
  }

  /**
   * Process promises with concurrency limit
   * Maintains up to `limit` concurrent executions at all times
   * @param promises Array of promises to execute
   * @param limit Maximum number of concurrent executions
   */
  private async processConcurrently<T>(
    promises: (() => Promise<T>)[],
    limit: number
  ): Promise<T[]> {
    const results: T[] = new Array(promises.length);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < promises.length; i++) {
      const index = i;
      const promise = promises[i];

      // Wrap promise to store result at correct index
      const wrappedPromise = promise()
        .then((result) => {
          results[index] = result;
        })
        .catch(() => {
          // Error already logged in updateAddressBalanceWithQueueUpdate
        })
        .finally(() => {
          // Remove from executing array when done
          const idx = executing.indexOf(wrappedPromise);
          if (idx !== -1) {
            executing.splice(idx, 1);
          }
        });

      executing.push(wrappedPromise);

      // Wait for one to complete if we've reached the limit
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    // Wait for all remaining promises to complete
    await Promise.all(executing);

    return results.filter((r) => r !== undefined) as T[];
  }

  /**
   * Get current queue statistics
   */
  getQueueStats(): { queueSize: number; addresses: string[] } {
    return {
      queueSize: this.updateQueue.size,
      addresses: Array.from(this.updateQueue.keys()),
    };
  }
}
