import { Result } from "../types/func";
import { CommitOp } from "../types/op";
import { BaseDao } from "./base-dao";

export type OpCommitData = {
  op: CommitOp;
  feeRate: string;
  satsPrice: string;
  result: Result[];
  inscriptionId?: string;
  txid?: string;
  inEventList?: boolean;
  height: number;
};

const TAG = "commit-dao";

export class OpCommitDao extends BaseDao<OpCommitData> {
  upsertByParent(parent: string, data: Partial<OpCommitData>) {
    // remove result
    // data = _.cloneDeep(data);
    // delete data.result;

    return this.upsertOne({ "op.parent": parent }, { $set: data });
  }

  async findLastCommitedOp() {
    return (
      await this.find(
        { inscriptionId: { $exists: true } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async findUnCommitOp() {
    return (
      await this.find(
        { inscriptionId: { $exists: false } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async findByParent(parent: string) {
    return await this.findOne({ "op.parent": parent });
  }

  async findNotInIndexer(goForward = 0) {
    const query = {
      inEventList: { $ne: true },
    };
    let res = await this.find(query, { projection: {} });
    const item = res[0] as any;
    if (goForward > 0 && !!item) {
      const res1 = await this.find(
        { _id: { $lt: item._id } },
        { sort: { _id: -1 }, limit: goForward }
      );
      res = res1.reverse().concat(res);
    }
    const parents = res.map((item) => {
      return item.op.parent;
    });
    logger.debug({ tag: TAG, msg: "findNotInIndexer", parents });
    return res;
  }

  async updateInEventList(inscriptionId: string, height: number) {
    await opCommitDao.updateOne(
      { inscriptionId },
      { $set: { inEventList: true, height } }
    );
  }
}
