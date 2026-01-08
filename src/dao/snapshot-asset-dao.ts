import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type SnapshotAssetData = {
  assetType: string;
  address: string;
  tick: string;
  balance: string;
};

export class SnapshotAssetDao extends BaseDao<SnapshotAssetData> {
  async upsertData(data: SnapshotAssetData, opts: UpdateOptions = {}) {
    await this.upsertOne(
      { tick: data.tick, address: data.address, assetType: data.assetType },
      { $set: data },
      opts
    );
  }
}
