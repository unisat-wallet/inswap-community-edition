import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type SnapshotKLastData = {
  tick: string;
  value: string;
};

export class SnapshotKLastDao extends BaseDao<SnapshotKLastData> {
  async upsertData(data: SnapshotKLastData, opts: UpdateOptions = {}) {
    await this.upsertOne({ tick: data.tick }, { $set: data }, opts);
  }
}
