import {
  AggregateOptions,
  BulkWriteOptions,
  Filter,
  FindOptions,
  IndexSpecification,
  InsertOneOptions,
  UpdateFilter,
  UpdateOptions,
} from "mongodb";
import { MongoUtils } from "../utils/mongo-utils";

export class BaseDao<K extends object> {
  protected readonly tableName: string;
  protected readonly projection: object;
  protected readonly db: MongoUtils;

  constructor(
    tableName: string,
    projection: object = { _id: 0 },
    db: MongoUtils = mongoUtils
  ) {
    this.tableName = tableName;
    this.projection = projection;
    this.db = db;
  }

  createIndex(indexSpec: IndexSpecification) {
    return this.db.createIndex(this.tableName, indexSpec);
  }

  count(filter: Filter<K>) {
    return this.db.count(this.tableName, filter);
  }

  // Fast estimated count for better performance
  estimatedCount(filter: Filter<K>) {
    return this.db.estimatedCount(this.tableName, filter);
  }

  insert(data: K, opts: InsertOneOptions = {}) {
    if (config.readonly) {
      return;
    }
    return this.db.insert(this.tableName, data, opts);
  }

  insertMany(data: K[], opts: BulkWriteOptions = {}) {
    if (config.readonly) {
      return;
    }
    return this.db.insertMany(this.tableName, data, opts);
  }

  findOne(filter: Filter<K>, opts: FindOptions = {}): Promise<K> {
    opts.projection = opts.projection || this.projection;
    return this.db.findOne(this.tableName, filter, opts);
  }

  find(filter: Filter<K>, opts: FindOptions = {}): Promise<K[]> {
    opts.projection = opts.projection || this.projection;
    return this.db.find(this.tableName, filter, opts);
  }

  aggregate(pipeline: object[], opts: AggregateOptions = {}) {
    return this.db.aggregate(this.tableName, pipeline, opts);
  }

  updateOne(
    findFilter: Filter<K>,
    updateFilter: UpdateFilter<K>,
    opts: UpdateOptions = {}
  ) {
    if (config.readonly) {
      return;
    }
    return this.db.updateOne(this.tableName, findFilter, updateFilter, opts);
  }

  updateMany(
    findFilter: Filter<K>,
    updateFilter: UpdateFilter<K>,
    opts: UpdateOptions = {}
  ) {
    if (config.readonly) {
      return;
    }
    return this.db.updateMany(this.tableName, findFilter, updateFilter, opts);
  }

  upsertOne(
    findFilter: Filter<K>,
    updateFilter: UpdateFilter<K>,
    opts: UpdateOptions = {}
  ) {
    if (config.readonly) {
      return;
    }
    return this.db.upsertOne(this.tableName, findFilter, updateFilter, opts);
  }

  async findFrom(findFilter: Filter<K>, include: boolean) {
    const res = (await this.findOne(findFilter, {
      projection: { _id: 1 },
    })) as any;
    if (!res) {
      return [];
    }
    let ret: K[];
    if (include) {
      ret = await this.find({ _id: { $gte: res._id } });
    } else {
      ret = await this.find({ _id: { $gt: res._id } });
    }
    return ret;
  }

  // find range [a, b]
  async findRange(start: Filter<K>, end: Filter<K>) {
    const startRes = (await this.findOne(start, {
      projection: { _id: 1 },
    })) as any;
    if (!startRes) {
      return [];
    }

    let endRes;
    if (end) {
      endRes = (await this.findOne(end, {
        projection: { _id: 1 },
      })) as any;
    }

    let ret;
    if (endRes) {
      ret = await this.find({ _id: { $gte: startRes._id, $lte: endRes._id } });
    } else {
      ret = await this.find({ _id: { $gte: startRes._id } });
    }

    return ret as K[];
  }
}
