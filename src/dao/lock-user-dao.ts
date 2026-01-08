import { BaseDao } from "./base-dao";
import { UpdateOptions } from "mongodb";

export type LockUserData = {
  tick0: string;
  tick1: string;
  address: string;
  lp: string;
  lastLockTs: number;
};

export class LockUserDao extends BaseDao<LockUserData> {
  upsertData(data: LockUserData, opts: UpdateOptions = {}) {
    return this.upsertOne(
      { tick0: data.tick0, tick1: data.tick1, address: data.address },
      { $set: data },
      opts
    );
  }
}
