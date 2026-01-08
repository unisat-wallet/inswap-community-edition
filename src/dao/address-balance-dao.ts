import { AllAddressBalanceRes } from "../types/route";
import { BaseDao } from "./base-dao";

export type AddressBalanceData = {
  address: string;
  balance: AllAddressBalanceRes;
};

export class AddressBalanceDao extends BaseDao<AddressBalanceData> {
  /**
   * Upsert address balance data
   * @param data Address balance data to upsert
   */
  async upsertAddressBalance(data: AddressBalanceData) {
    await this.upsertOne({ address: data.address }, { $set: { ...data } });
  }

  /**
   * Find balance data for a specific address
   * @param address The address to query
   * @returns Address balance data or null if not found
   */
  async findAddressBalance(
    address: string
  ): Promise<AddressBalanceData | null> {
    return await this.findOne({ address });
  }

  /**
   * Find all balance data for a specific address
   * @param address The address to query
   * @returns Array of address balance data
   */
  async findAddressAllBalances(address: string): Promise<AddressBalanceData[]> {
    return await this.find({ address });
  }
}
