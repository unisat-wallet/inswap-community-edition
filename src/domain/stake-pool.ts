import { LocalWallet } from "@unisat/wallet-sdk/lib/wallet";
import _ from "lodash";
import { ClientSession } from "mongodb";
import { bn, bnDecimal, decimalCal } from "../contract/bn";
import { StakeHistoryData } from "../dao/stake-history-dao";
import { StakePoolData } from "../dao/stake-pool-dao";
import { StakeUserData } from "../dao/stake-user-dao";
import { StakeHistoryType } from "../types/route";
import { LP_DECIMAL, UNCONFIRM_HEIGHT } from "./constant";
import {
  insufficient_balance,
  invalid_amount,
  staking_not_start,
  staking_over,
} from "./error";
import { getLpInfo, need } from "./utils";

const TAG = "stake-pool";

export type StakePoolUserInfo = {
  [address: string]: {
    amount: string;
    rewardDebt: string;
    rewardUnclaimed: string;
    rewardClaimed: string;
    lastStakeTs: number;
  };
};

export class StakePool {
  readonly eid: string;
  readonly pid: string;
  readonly tick0: string;
  readonly tick1: string;
  readonly rewardTick: string;

  private lastRewardBlock: number;
  private fbPerBlock: string;
  private accFbPerShare: string;
  private userInfo: StakePoolUserInfo;
  private lpSupply: string;
  private startBlock: number;
  private endBlock: number;
  private stakingLimit: string;
  private baseReward: string;
  private stageNeedLp: string[];
  private stageAddedRewards: string[];
  private stageAddedRewardsHeight: number[];
  private stageAddedRewardsFbPerBlock: string[];
  private apy: number;

  get LastRewardBlock() {
    return this.lastRewardBlock;
  }
  get FbPerBlock() {
    return this.fbPerBlock;
  }
  get AccFbPerShare() {
    return this.accFbPerShare;
  }
  get UserInfo() {
    return this.userInfo;
  }
  get LpSupply() {
    return this.lpSupply;
  }
  get StartBlock() {
    return this.startBlock;
  }
  get EndBlock() {
    return this.endBlock;
  }
  get StakingLimit() {
    return this.stakingLimit;
  }
  get BaseReward() {
    return this.baseReward;
  }
  get StageNeedLp() {
    return this.stageNeedLp;
  }
  get StageAddedRewards() {
    return this.stageAddedRewards;
  }
  get StageAddedRewardsHeight() {
    return this.stageAddedRewardsHeight;
  }
  get StageAddedRewardsFbPerBlock() {
    return this.stageAddedRewardsFbPerBlock;
  }
  get Apy() {
    return 0;
    // return this.apy;
  }

  wallet: LocalWallet;

  clone(): StakePool {
    const clone = new StakePool({
      eid: this.eid,
      pid: this.pid,
      tick0: this.tick0,
      tick1: this.tick1,
      rewardTick: this.rewardTick,
      lastRewardBlock: this.lastRewardBlock,
      fbPerBlock: this.fbPerBlock,
      accFbPerShare: this.accFbPerShare,
      userInfo: _.cloneDeep(this.userInfo),
      lpSupply: this.lpSupply,
      startBlock: this.startBlock,
      endBlock: this.endBlock,
      stageNeedLp: _.cloneDeep(this.stageNeedLp),
      stageAddedRewards: _.cloneDeep(this.stageAddedRewards),
      stakingLimit: this.stakingLimit,
      stageAddedRewardsHeight: _.cloneDeep(this.stageAddedRewardsHeight),
      stageAddedRewardsFbPerBlock: _.cloneDeep(
        this.stageAddedRewardsFbPerBlock
      ),
      apy: this.apy,
    });
    return clone;
  }

  constructor(params: {
    eid: string;
    pid: string;
    tick0: string;
    tick1: string;
    rewardTick: string;
    lastRewardBlock: number;
    fbPerBlock: string;
    accFbPerShare: string;
    stakingLimit: string;
    userInfo: StakePoolUserInfo;
    lpSupply: string;
    startBlock: number;
    endBlock: number;
    stageNeedLp: string[];
    stageAddedRewards: string[];
    stageAddedRewardsHeight: number[];
    stageAddedRewardsFbPerBlock: string[];
    apy?: number;
  }) {
    need(
      params.lastRewardBlock >= 0 && params.lastRewardBlock !== UNCONFIRM_HEIGHT
    );
    need(parseFloat(params.fbPerBlock) >= 0);
    need(parseFloat(params.accFbPerShare) >= 0);
    need(parseFloat(params.lpSupply) >= 0);
    need(parseFloat(params.stakingLimit) > 0);
    let lpSupply = "0";
    for (const address in params.userInfo) {
      const user = params.userInfo[address];
      lpSupply = decimalCal([lpSupply, "add", user.amount], LP_DECIMAL);
    }
    need(lpSupply == params.lpSupply);
    need(params.lastRewardBlock >= params.startBlock);
    this.eid = params.eid;
    this.pid = params.pid;
    this.lastRewardBlock = params.lastRewardBlock;
    this.fbPerBlock = params.fbPerBlock;
    this.tick0 = params.tick0;
    this.tick1 = params.tick1;
    this.rewardTick = params.rewardTick;
    this.accFbPerShare = params.accFbPerShare;
    this.stakingLimit = params.stakingLimit;
    this.userInfo = params.userInfo;
    this.lpSupply = params.lpSupply;
    this.startBlock = params.startBlock;
    this.endBlock = params.endBlock;
    this.stageAddedRewardsHeight = params.stageAddedRewardsHeight || [];
    this.stageAddedRewardsFbPerBlock = params.stageAddedRewardsFbPerBlock || [];
    this.baseReward = this.getBaseReward();
    this.stageNeedLp = params.stageNeedLp;
    this.stageAddedRewards = params.stageAddedRewards;
    this.apy = params.apy || 0;
  }

  getBaseReward() {
    const count = Math.max(0, this.endBlock - this.startBlock);
    let ret = decimalCal(
      [this.fbPerBlock, "mul", count],
      decimal.get(this.rewardTick)
    );
    return ret;
  }

  private async calculateApy() {
    if (parseFloat(this.lpSupply) <= 0) {
      this.apy = 0;
      return;
    }

    try {
      // Calculate rewards per block (30 seconds)
      const rewardsPerBlock = decimalCal([
        this.fbPerBlock,
        "add",
        this.stageAddedRewardsFbPerBlock.reduce(
          (sum, reward) => decimalCal([sum, "add", reward]),
          "0"
        ),
      ]);

      // Calculate annual rewards (FB amount)
      const blocksPerYear = (365 * 24 * 60 * 60) / 30; // 30 seconds per block
      const annualRewards = parseFloat(
        decimalCal([rewardsPerBlock, "mul", blocksPerYear.toString()])
      );

      // Get FB price to convert annual rewards to USD value
      const fbPrice = await global.query.getTickPrice(this.rewardTick);
      const annualRewardsUSD = annualRewards * fbPrice;

      // Get LP USD value using getLpInfo
      const lpInfo = await getLpInfo({
        tick0: this.tick0,
        tick1: this.tick1,
        lp: this.lpSupply,
      });
      const totalStakedLpUSD = lpInfo.value;

      // Calculate APY: (annual rewards in USD) / (total staked LP in USD)
      this.apy = totalStakedLpUSD > 0 ? annualRewardsUSD / totalStakedLpUSD : 0;
    } catch (error) {
      // If calculation fails, set APY to 0
      this.apy = 0;
      logger.error({
        tag: "StakePool",
        msg: "Failed to calculate APY with USD values",
        pid: this.pid,
        error: error.message,
      });
    }
  }

  getExtractReward() {
    let ret = "0";
    for (let i = 0; i < this.stageAddedRewardsHeight.length; i++) {
      ret = decimalCal(
        [ret, "add", this.stageAddedRewards[i]],
        decimal.get(this.rewardTick)
      );
    }
    return ret;
  }

  getDistributedReward() {
    const reach = Math.min(env.NewestHeight, this.endBlock);
    const count = Math.max(0, reach - this.startBlock);
    let ret = decimalCal(
      [this.fbPerBlock, "mul", count],
      decimal.get(this.rewardTick)
    );
    return ret;
  }

  getExtractDistributedReward() {
    const reach = Math.min(env.NewestHeight, this.endBlock);
    let ret = "0";
    for (let i = 0; i < this.stageAddedRewardsHeight.length; i++) {
      if (
        reach - this.stageAddedRewardsHeight[i] > 0 &&
        parseFloat(this.stageAddedRewardsFbPerBlock[i]) > 0
      ) {
        const addedReward = decimalCal(
          [
            this.stageAddedRewardsFbPerBlock[i],
            "mul",
            reach - this.stageAddedRewardsHeight[i],
          ],
          decimal.get(this.rewardTick)
        );
        ret = decimalCal(
          [ret, "add", addedReward],
          decimal.get(this.rewardTick)
        );
      }
    }
    return ret;
  }

  updatePool() {
    let newestHeight = env.NewestHeight;
    if (env.NewestHeight > this.endBlock) {
      newestHeight = this.endBlock;
    }
    if (newestHeight <= this.lastRewardBlock) {
      return;
    }

    if (this.lpSupply == "0") {
      this.lastRewardBlock = newestHeight;
      return;
    }

    const count = newestHeight - this.lastRewardBlock;
    need(count >= 0);
    let accReward = decimalCal(
      [count, "mul", this.fbPerBlock],
      decimal.get(this.rewardTick)
    );
    for (let i = 0; i < this.stageAddedRewardsFbPerBlock.length; i++) {
      const stageAddedRewardsFbPerBlock = this.stageAddedRewardsFbPerBlock[i];
      const addedReward = decimalCal(
        [stageAddedRewardsFbPerBlock, "mul", count],
        decimal.get(this.rewardTick)
      );
      accReward = decimalCal(
        [accReward, "add", addedReward],
        decimal.get(this.rewardTick)
      );
    }

    this.accFbPerShare = decimalCal(
      [
        decimalCal(
          [accReward, "div", this.lpSupply],
          decimal.get(this.rewardTick)
        ),
        "add",
        this.accFbPerShare,
      ],
      decimal.get(this.rewardTick)
    );
    this.lastRewardBlock = newestHeight;

    // Calculate APY
    void this.calculateApy();
  }

  settlement(address: string) {
    if (!this.userInfo[address]) {
      this.userInfo[address] = {
        amount: "0",
        rewardDebt: "0",
        rewardUnclaimed: "0",
        rewardClaimed: "0",
        lastStakeTs: 0,
      };
    }

    const user = this.userInfo[address];
    if (bn(user.amount).gt(0)) {
      const pending = decimalCal(
        [user.amount, "mul", this.accFbPerShare, "sub", user.rewardDebt],
        decimal.get(this.rewardTick)
      );
      if (bn(pending).gt(0)) {
        user.rewardUnclaimed = decimalCal(
          [user.rewardUnclaimed, "add", pending],
          decimal.get(this.rewardTick)
        );
        user.rewardDebt = decimalCal(
          [user.amount, "mul", this.accFbPerShare],
          decimal.get(this.rewardTick)
        );
      }
    }
  }

  async updatePoolDao(session?: ClientSession) {
    const poolInfo = {
      pid: this.pid,
      tick0: this.tick0,
      tick1: this.tick1,
      lastRewardBlock: this.lastRewardBlock,
      fbPerBlock: this.fbPerBlock,
      accFbPerShare: this.accFbPerShare,
      lpSupply: this.lpSupply,
      stageAddedRewardsHeight: this.stageAddedRewardsHeight,
      stageAddedRewardsFbPerBlock: this.stageAddedRewardsFbPerBlock,
      apy: this.apy,
    };
    await stakePoolDao.updateOne(
      { pid: this.pid },
      { $set: poolInfo },
      session ? { session } : {}
    );
    return poolInfo;
  }

  async updateUserDao(address: string, session?: ClientSession) {
    const user = this.userInfo[address];
    const userInfo = {
      pid: this.pid,
      tick0: this.tick0,
      tick1: this.tick1,
      address,
      amount: user.amount,
      rewardDebt: user.rewardDebt,
      rewardUnclaimed: user.rewardUnclaimed,
      rewardClaimed: user.rewardClaimed,
      lastStakeTs: user.lastStakeTs,
    };
    await stakeUserDao.upsertOne(
      { pid: this.pid, address },
      { $set: userInfo },
      { session }
    );
    return userInfo;
  }

  async updateRecordDao(
    params: {
      id: string;
      type: StakeHistoryType;
      tick: string;
      address: string;
      amount: string;
      userInfo: Partial<StakeUserData>;
      poolInfo: Partial<StakePoolData>;
    },
    session?: ClientSession
  ) {
    const { id, type, tick, address, amount, userInfo, poolInfo } = params;

    const res = await operator.quoteRemoveLiq({
      address: "",
      tick0: this.tick0,
      tick1: this.tick1,
      lp: amount,
    });
    const tick0Price = await query.getTickPrice(this.tick0);
    const tick1Price = await query.getTickPrice(this.tick1);
    const tick0Value = decimalCal([tick0Price, "mul", res.amount0]);
    const tick1Value = decimalCal([tick1Price, "mul", res.amount1]);
    const value = parseFloat(decimalCal([tick0Value, "add", tick1Value]));

    const record: StakeHistoryData = {
      id,
      pid: this.pid,
      address: address,
      poolTick0: this.tick0,
      poolTick1: this.tick1,
      type,
      amount,
      tick,
      ts: Math.floor(Date.now() / 1000),
      status: "success",
      userInfo,
      poolInfo,
      height: env.NewestHeight,
      value,
      amount0: res.amount0,
      amount1: res.amount1,
      tick0Price,
      tick1Price,
    };
    need(!!id, "id not exist");
    await stakeHistoryDao.upsertOne({ id }, { $set: record }, { session });
  }

  async deposit(id: string, address: string, amount: string, test = false) {
    if (test) {
      return this.__deposit(address, amount, true);
    }

    this.__deposit(address, amount, false);
    // await mongoUtils.startTransaction(async (session) => {
    //   const poolInfo = await this.updatePoolDao(session);
    //   const userInfo = await this.updateUserDao(address, session);
    //   await this.updateRecordDao(
    //     { id, type: "stake", tick: "LP", amount, address, userInfo, poolInfo },
    //     session
    //   );
    // });
  }

  private __deposit(address: string, amount: string, test = false) {
    if (test) {
      const clone = this.clone();
      return clone.__deposit(address, amount);
    }

    need(bn(amount).gt(0), invalid_amount);
    need(env.BestHeight < this.endBlock, staking_over);
    need(env.BestHeight >= this.startBlock, staking_not_start);
    need(
      bn(decimalCal([this.lpSupply, "add", amount], LP_DECIMAL)).lte(
        this.stakingLimit
      ),
      `Locked LP Cap of the trading pair Reached: Maximum Limit (${this.stakingLimit}).`
    );
    this.updatePool();

    if (!this.userInfo[address]) {
      this.userInfo[address] = {
        amount: "0",
        rewardDebt: "0",
        rewardUnclaimed: "0",
        rewardClaimed: "0",
        lastStakeTs: 0,
      };
    }

    this.settlement(address);

    // need to transfer lp to stakePool before
    const user = this.userInfo[address];
    user.amount = decimalCal([user.amount, "add", amount], LP_DECIMAL);
    user.rewardDebt = decimalCal(
      [user.amount, "mul", this.accFbPerShare],
      decimal.get(this.rewardTick)
    );
    user.lastStakeTs = Math.floor(Date.now() / 1000);
    this.lpSupply = decimalCal([this.lpSupply, "add", amount], LP_DECIMAL);
    need(bn(user.amount).gte(0), invalid_amount);
    need(bn(user.rewardDebt).gte(0), invalid_amount);
    need(bn(this.lpSupply).gte(0), invalid_amount);

    // check if need to add rewards
    for (let i = 0; i < this.stageNeedLp.length; i++) {
      const stageNeedLp = this.stageNeedLp[i];
      need(!!this.stageAddedRewards[i], "stage added rewards not exist");
      if (
        !this.stageAddedRewardsHeight[i] &&
        bn(this.lpSupply).gte(stageNeedLp)
      ) {
        this.stageAddedRewardsHeight[i] = env.NewestHeight + 1;
        const blocks = this.endBlock - this.stageAddedRewardsHeight[i];
        this.stageAddedRewardsFbPerBlock[i] = decimalCal(
          [this.stageAddedRewards[i], "div", blocks],
          decimal.get(this.rewardTick)
        );
      }
    }
  }

  async withdraw(id, address: string, amount: string, test = false) {
    if (test) {
      return this.__withdraw(address, amount, true);
    }
    this.__withdraw(address, amount, false);

    // await mongoUtils.startTransaction(async (session) => {
    //   const poolInfo = await this.updatePoolDao(session);
    //   const userInfo = await this.updateUserDao(address, session);
    //   await this.updateRecordDao(
    //     {
    //       id,
    //       type: "unstake",
    //       tick: "LP",
    //       amount,
    //       address,
    //       userInfo,
    //       poolInfo,
    //     },
    //     session
    //   );
    // });
  }

  private __withdraw(address: string, amount: string, test = false) {
    if (test) {
      const clone = this.clone();
      return clone.__withdraw(address, amount);
    }

    need(env.BestHeight >= this.startBlock, staking_not_start);
    need(bn(amount).gt(0));
    need(!!this.userInfo[address]);
    need(bn(this.userInfo[address].amount).gte(amount), insufficient_balance);

    this.updatePool();
    this.settlement(address);

    const user = this.userInfo[address];
    user.amount = decimalCal([user.amount, "sub", amount], LP_DECIMAL);
    user.rewardDebt = decimalCal(
      [user.amount, "mul", this.accFbPerShare],
      decimal.get(this.rewardTick)
    );
    this.lpSupply = decimalCal([this.lpSupply, "sub", amount], LP_DECIMAL);

    need(bn(user.rewardDebt).gte(0), invalid_amount);
    need(bn(this.lpSupply).gte(0), invalid_amount);
  }

  async claim(id: string, address: string, amount: string, test = false) {
    if (test) {
      return this.__claim(address, amount, true);
    }

    this.__claim(address, amount, false);

    // await mongoUtils.startTransaction(async (session) => {
    //   const poolInfo = await this.updatePoolDao(session);
    //   const userInfo = await this.updateUserDao(address, session);
    //   await this.updateRecordDao(
    //     {
    //       id,
    //       type: "claim",
    //       tick: this.rewardTick,
    //       amount,
    //       address,
    //       userInfo,
    //       poolInfo,
    //     },
    //     session
    //   );
    // });
  }

  private __claim(address: string, amount: string, test = false): string {
    if (test) {
      const clone = this.clone();
      return clone.__claim(address, amount);
    }
    this.updatePool();
    this.settlement(address);

    const user = this.userInfo[address];
    need(bn(user.amount).gte(0), invalid_amount);
    need(bn(user.rewardClaimed).gte(0), invalid_amount);
    need(bn(user.rewardUnclaimed).gte(amount), invalid_amount);

    user.rewardUnclaimed = decimalCal(
      [user.rewardUnclaimed, "sub", amount],
      decimal.get(this.rewardTick)
    );
    user.rewardClaimed = decimalCal(
      [user.rewardClaimed, "add", amount],
      decimal.get(this.rewardTick)
    );
  }

  getUnclaimed(address: string) {
    const user = this.userInfo[address];
    if (user) {
      this.updatePool();
      const pending = decimalCal(
        [user.amount, "mul", this.accFbPerShare, "sub", user.rewardDebt],
        decimal.get(this.rewardTick)
      );
      need(bn(pending).gte(0), invalid_amount);
      need(bn(user.rewardUnclaimed).gte(0), invalid_amount);
      return decimalCal(
        [user.rewardUnclaimed, "add", pending],
        decimal.get(this.rewardTick)
      );
    } else {
      return "0";
    }
  }

  checkPoolBalance() {
    const poolBalance = bnDecimal(
      operator.PendingSpace.Assets.getBalance(
        this.wallet.address,
        this.rewardTick
      ),
      decimal.get(this.rewardTick)
    );
    const expectedRemain = decimalCal([
      Math.max(this.endBlock - env.NewestHeight, 0),
      "mul",
      this.fbPerBlock,
    ]);
    // logger.debug({
    //   tag: TAG,
    //   msg: "checkPoolBalance",
    //   expectedRemain,
    //   poolBalance,
    // });
    if (config.checkStakePoolBalance) {
      need(parseFloat(poolBalance) >= parseFloat(expectedRemain));
    }
  }
}
