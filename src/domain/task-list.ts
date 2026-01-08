import { StakeHistoryType } from "../types/route";
import { loggerError } from "../utils/utils";

export class TaskList {
  constructor() {}

  /**
   * Calculate task completion status for a specific address and itemId
   */
  async calculateTaskCompletion(
    address: string,
    itemId: string,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    try {
      global.logger.debug({
        tag: "TaskList.calculateTaskCompletion",
        msg: `Calculating task ${itemId} for ${address} from ${startTime} to ${endTime}`,
      });

      switch (itemId) {
        case "1":
          return await this.checkAddLiquidity(address, startTime, endTime);
        case "2":
          return await this.checkStakeSfbBtc(address, startTime, endTime);
        case "3":
          return await this.checkStakeSfbSats(address, startTime, endTime);
        case "4":
          return await this.checkSwapSfbBtc(address, startTime, endTime);
        case "5":
          return await this.checkSwapFbBtcVolume(
            1000,
            address,
            startTime,
            endTime
          );
        case "5-test":
          return await this.checkSwapFbBtcVolume(
            0.01,
            address,
            startTime,
            endTime
          );
        default:
          return false;
      }
    } catch (error) {
      loggerError(
        `TaskList.calculateTaskCompletion for ${address} itemId ${itemId}`,
        error
      );
      return false;
    }
  }

  /**
   * Check if address has staked sFB___000/sBTC___000 pair during the period
   */
  private async checkStakeSfbBtc(
    address: string,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    global.logger.debug({
      tag: "TaskList.checkStakeSfbBtc",
      msg: `Checking sFB___000/sBTC___000 stake for ${address}`,
    });

    const query = {
      $or: [
        { poolTick0: "sFB___000", poolTick1: "sBTC___000" },
        { poolTick0: "sBTC___000", poolTick1: "sFB___000" },
      ],
      address,
      type: "stake" as StakeHistoryType,
      ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
      status: "success" as const,
    };

    const stakeHistory = await global.stakeHistoryDao.find(query);
    const result = stakeHistory.length > 0;
    global.logger.debug({
      tag: "TaskList.checkStakeSfbBtc",
      msg: `Found ${stakeHistory.length} records, result: ${result}`,
    });
    return result;
  }

  /**
   * Check if address has added liquidity during the period
   */
  private async checkAddLiquidity(
    address: string,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    global.logger.debug({
      tag: "TaskList.checkAddLiquidity",
      msg: `Checking add liquidity for ${address}`,
    });

    const query = {
      address,
      type: "add" as const,
      ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
      success: true,
    };

    const liqHistory = await global.recordLiqDao.findOne(query);
    const result = !!liqHistory;
    return result;
  }

  /**
   * Check if address has staked sFB___000/sSATS___000 pair during the period
   */
  private async checkStakeSfbSats(
    address: string,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    global.logger.debug({
      tag: "TaskList.checkStakeSfbSats",
      msg: `Checking sFB___000/sSATS___000 stake for ${address}`,
    });

    const query = {
      $or: [
        { poolTick0: "sFB___000", poolTick1: "sSATS___000" },
        { poolTick0: "sSATS___000", poolTick1: "sFB___000" },
      ],
      address,
      type: "stake" as StakeHistoryType,
      ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
      status: "success" as const,
    };

    const stakeHistory = await global.stakeHistoryDao.find(query);
    const result = stakeHistory.length > 0;
    global.logger.debug({
      tag: "TaskList.checkStakeSfbSats",
      msg: `Found ${stakeHistory.length} records, result: ${result}`,
    });
    return result;
  }

  /**
   * Check if address has swapped sFB___000/sBTC___000 pair during the period
   */
  private async checkSwapSfbBtc(
    address: string,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    global.logger.debug({
      tag: "TaskList.checkSwapSfbBtc",
      msg: `Checking sFB___000/sBTC___000 swap for ${address}`,
    });

    const query = {
      $or: [
        { tickIn: "sFB___000", tickOut: "sBTC___000" },
        { tickIn: "sBTC___000", tickOut: "sFB___000" },
      ],
      address,
      ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
      success: true,
    };

    const swapHistory = await global.recordSwapDao.find(query);
    const result = swapHistory.length > 0;
    global.logger.debug({
      tag: "TaskList.checkSwapSfbBtc",
      msg: `Found ${swapHistory.length} records, result: ${result}`,
    });
    return result;
  }

  /**
   * Check if address has swapped sFB___000/sBTC___000 with at least 1000fb volume during the period
   */
  private async checkSwapFbBtcVolume(
    minVolume: number,
    address: string,
    startTime: number,
    endTime: number
  ): Promise<boolean> {
    global.logger.debug({
      tag: "TaskList.checkSwapFbBtcVolume",
      msg: `Checking sFB___000/sBTC___000 swap volume for ${address}`,
    });

    const query = {
      $or: [
        { tickIn: "sFB___000", tickOut: "sBTC___000" },
        { tickIn: "sBTC___000", tickOut: "sFB___000" },
      ],
      address,
      ts: { $gte: startTime / 1000, $lte: endTime / 1000 },
      success: true,
    };

    const swapHistory = await global.recordSwapDao.find(query);

    // Calculate total sFB___000 volume (both as input and output)
    let totalFbVolume = 0;

    for (const swap of swapHistory) {
      if (swap.tickIn === "sFB___000") {
        // sFB___000 as input
        const amountIn = parseFloat(swap.amountIn);
        if (!isNaN(amountIn)) {
          totalFbVolume += amountIn;
        }
      } else if (swap.tickOut === "sFB___000") {
        // sFB___000 as output
        const amountOut = parseFloat(swap.amountOut);
        if (!isNaN(amountOut)) {
          totalFbVolume += amountOut;
        }
      }
    }

    const result = totalFbVolume >= minVolume;
    global.logger.debug({
      tag: "TaskList.checkSwapFbBtcVolume",
      msg: `Found ${swapHistory.length} records, total sFB___000 volume: ${totalFbVolume}, result: ${result}`,
    });
    return result;
  }

  /**
   * Update task completion status for all items of a specific tid
   */
  async updateTaskCompletionStatus(
    tid: string,
    address: string
  ): Promise<void> {
    try {
      global.logger.debug({
        tag: "TaskList.updateTaskCompletionStatus",
        msg: `Updating task completion for ${address} tid ${tid}`,
      });

      // Get all task items for the tid
      const taskMetaList = await global.taskMetaDao.find({ tid });
      global.logger.debug({
        tag: "TaskList.updateTaskCompletionStatus",
        msg: `Found ${taskMetaList.length} task meta items`,
      });

      // Get existing completion status for this address and tid
      const existingTasks = await global.taskDao.find({ tid, address });
      const existingTaskMap = new Map<string, boolean>();

      for (const existingTask of existingTasks) {
        existingTaskMap.set(existingTask.itemId, existingTask.done || false);
      }

      global.logger.debug({
        tag: "TaskList.updateTaskCompletionStatus",
        msg: `Found ${existingTasks.length} existing tasks`,
      });

      for (const taskMeta of taskMetaList) {
        const existingDone = existingTaskMap.get(taskMeta.itemId);

        // Skip calculation if task is already completed
        if (existingDone === true) {
          global.logger.debug({
            tag: "TaskList.updateTaskCompletionStatus",
            msg: `Skipping completed task ${taskMeta.itemId}`,
          });
          continue;
        }

        global.logger.debug({
          tag: "TaskList.updateTaskCompletionStatus",
          msg: `Calculating task ${taskMeta.itemId}`,
        });

        // Calculate completion status only if not already completed
        const isCompleted = await this.calculateTaskCompletion(
          address,
          taskMeta.itemId,
          taskMeta.startTime,
          taskMeta.endTime
        );

        global.logger.debug({
          tag: "TaskList.updateTaskCompletionStatus",
          msg: `Task ${taskMeta.itemId} completion: ${isCompleted}`,
        });

        // Update or insert task completion status
        await global.taskDao.upsertOne(
          { tid, itemId: taskMeta.itemId, address },
          {
            $set: {
              tid,
              itemId: taskMeta.itemId,
              address,
              done: isCompleted,
            },
          }
        );
      }

      global.logger.debug({
        tag: "TaskList.updateTaskCompletionStatus",
        msg: `Completed updating tasks for ${address} tid ${tid}`,
      });
    } catch (error) {
      loggerError(
        `TaskList.updateTaskCompletionStatus for ${address} tid ${tid}`,
        error
      );
    }
  }
}
