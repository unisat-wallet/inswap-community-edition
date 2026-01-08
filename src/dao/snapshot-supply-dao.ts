import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type SnapshotSupply = {
  tick: string;
  assetType: string;
  supply: string;
};

export class SnapshotSupplyDao extends BaseDao<SnapshotSupply> {
  async upsertData(data: SnapshotSupply, opts: UpdateOptions = {}) {
    await this.upsertOne(
      { tick: data.tick, assetType: data.assetType },
      { $set: data },
      opts
    );
  }
}
