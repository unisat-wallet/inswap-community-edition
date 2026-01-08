import { UpdateOptions } from "mongodb";
import { OpEvent, OpType } from "../types/op";
import { BaseDao } from "./base-dao";

export class OpEventDao extends BaseDao<OpEvent> {
  async findLastCommit() {
    return (
      await this.find(
        { "op.op": OpType.commit },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async upsertData(data: OpEvent, opts: UpdateOptions = {}) {
    await opEventDao.upsertOne(
      {
        cursor: data.cursor,
      },
      { $set: data },
      opts
    );
  }
}
