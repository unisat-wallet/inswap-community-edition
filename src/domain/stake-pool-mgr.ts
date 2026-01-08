import { AddressType } from "@unisat/wallet-sdk";
import { NetworkType } from "@unisat/wallet-sdk/lib/network";
import { LocalWallet } from "@unisat/wallet-sdk/lib/wallet";
import { bnDecimal, decimalCal } from "../contract/bn";
import { getPairStructV2, getPairStrV2 } from "../contract/contract-utils";
import { aesDecrypt } from "../lib/crypto";
import { LP_DECIMAL } from "./constant";
import { exception_locked_amount, stake_pool_not_exist } from "./error";
import { StakePool, StakePoolUserInfo } from "./stake-pool";
import { need } from "./utils";

export class StakePoolMgr {
  poolMap: { [pid: string]: StakePool } = {};

  isPoolAddr(address: string) {
    for (const pid in this.poolMap) {
      if (this.poolMap[pid].wallet.address == address) {
        return true;
      }
    }
    return false;
  }

  async checkLockAmount(address: string, pair: string) {
    let amount = "0";
    for (const pid in this.poolMap) {
      const pool = this.poolMap[pid];
      const poolPair = getPairStrV2(pool.tick0, pool.tick1);
      if (poolPair == pair) {
        amount = decimalCal([
          amount,
          "add",
          pool.UserInfo[address]?.amount || "0",
        ]);
      }
    }
    const userLockLp = await lockLp.getUserLockLp(pair, address);
    const lockAmount = bnDecimal(
      operator.PendingSpace.Assets.getBalance(address, pair, "lock"),
      LP_DECIMAL
    );
    need(
      decimalCal([lockAmount, "sub", userLockLp.lp]) == amount,
      exception_locked_amount
    );
  }

  async init() {
    const res0 = await stakeEpochDao.find({});
    for (let i = 0; i < res0.length; i++) {
      const item0 = res0[i];

      const res1 = await stakePoolDao.find({ pid: { $in: item0.pids } });
      for (let j = 0; j < res1.length; j++) {
        const item1 = res1[j];
        console.log("load stake pool: ", item1.pid);

        const res2 = await stakeUserDao.find({ pid: item1.pid });
        const userInfo: StakePoolUserInfo = {};
        for (let k = 0; k < res2.length; k++) {
          const item2 = res2[k];
          userInfo[item2.address] = {
            amount: item2.amount,
            rewardDebt: item2.rewardDebt,
            rewardUnclaimed: item2.rewardUnclaimed,
            rewardClaimed: item2.rewardClaimed,
            lastStakeTs: item2.lastStakeTs,
          };
        }

        const stakePool = new StakePool({
          eid: item0.eid,
          pid: item1.pid,
          tick0: item1.tick0,
          tick1: item1.tick1,
          rewardTick: item1.rewardTick,
          lastRewardBlock: item1.lastRewardBlock,
          fbPerBlock: item1.fbPerBlock,
          accFbPerShare: item1.accFbPerShare,
          userInfo: userInfo,
          lpSupply: item1.lpSupply,
          startBlock: item0.startBlock,
          endBlock: item0.endBlock,
          stageNeedLp: item1.stageNeedLp,
          stageAddedRewards: item1.stageAddedRewards,
          stakingLimit: item1.stakingLimit,
          stageAddedRewardsHeight: item1.stageAddedRewardsHeight,
          stageAddedRewardsFbPerBlock: item1.stageAddedRewardsFbPerBlock,
          apy: item1.apy || 0,
        });

        let wif: string;
        if (item1.walletWifWithKey) {
          wif = aesDecrypt(item1.walletWifWithKey, process.env.KEY);
        } else {
          wif = item1.walletWif;
        }
        stakePool.wallet = new LocalWallet(
          wif,
          AddressType.P2TR,
          NetworkType.MAINNET
        );
        need(stakePool.wallet.address == item1.walletAddress);
        this.poolMap[stakePool.pid] = stakePool;
      }
    }
  }

  getStakePool(pid: string) {
    const stakePool = this.poolMap[pid];
    need(!!stakePool, stake_pool_not_exist);
    return stakePool;
  }
}
