import { UpdateOptions } from "mongodb";
import { BaseDao } from "./base-dao";

export type AssetData = {
  cursor: number;
  commitParent: string; // In which commit was the balance updated
  height: number;
  assetType: string;
  address: string;
  tick: string;
  balance: string;
  displayBalance: string;
};

export class AssetDao extends BaseDao<AssetData> {
  async upsertData(data: AssetData, opts: UpdateOptions = {}) {
    await this.upsertOne(
      { tick: data.tick, address: data.address, assetType: data.assetType },
      { $set: data },
      opts
    );
  }
}
