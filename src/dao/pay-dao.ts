import { need } from "../contract/contract-utils";
import { PayType } from "../types/route";
import { BaseDao } from "./base-dao";

export type PayData = {
  address: string;
  defaultPayType: PayType;
  rememberPayType: boolean;
};

export class PayDao extends BaseDao<PayData> {
  private cache: { [address: string]: PayData } = {};

  // async getPayType(address: string) {
  //   const res = await this.findOne({ address });
  //   return res?.defaultPayType;
  // }

  async upsertData(data: Partial<PayData>) {
    need(!!data.address);
    delete this.cache[data.address];
    await this.upsertOne({ address: data.address }, { $set: data });
  }
}
