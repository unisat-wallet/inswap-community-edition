import {
  AggregateOptions,
  BulkWriteOptions,
  ClientSession,
  CountDocumentsOptions,
  Filter,
  FindOptions,
  IndexSpecification,
  InsertOneOptions,
  MongoClient,
  UpdateFilter,
  UpdateOptions,
} from "mongodb";

export class MongoUtils {
  readonly url: string;
  readonly dbName: string;

  client: MongoClient;

  constructor(url: string, dbName: string) {
    this.url = url;
    this.dbName = dbName;
  }

  async startTransaction(action: (session: ClientSession) => void) {
    const session = this.client.startSession();
    session.startTransaction();
    try {
      await action(session);
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async init() {
    this.client = await MongoClient.connect(this.url, {
      useUnifiedTopology: true,
      minPoolSize: 10,
      maxPoolSize: 20,
    } as any);
  }

  async createIndex(tableName: string, indexSpec: IndexSpecification) {
    return await this.client.db(this.dbName).createIndex(tableName, indexSpec);
  }

  count(
    tableName: string,
    findFilter: object,
    opts: CountDocumentsOptions = {}
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .countDocuments(findFilter, opts)
        .then((res: number) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  // Fast estimated count using collection stats
  async estimatedCount(
    tableName: string,
    findFilter: object = {}
  ): Promise<number> {
    try {
      // If filter is empty, use collection stats for fast estimation
      if (Object.keys(findFilter).length === 0) {
        const stats = await this.client
          .db(this.dbName)
          .collection(tableName)
          .stats();
        return stats.count || 0;
      }

      // For non-empty filters, use sampling for estimation
      const pipeline = [
        { $match: findFilter },
        { $sample: { size: 1000 } }, // Sample 1000 documents
        { $count: "sampleCount" },
      ];

      const result = await this.client
        .db(this.dbName)
        .collection(tableName)
        .aggregate(pipeline)
        .toArray();
      const sampleCount = result[0]?.sampleCount || 0;

      // Estimate total count based on sample ratio
      const totalStats = await this.client
        .db(this.dbName)
        .collection(tableName)
        .stats();
      const totalCount = totalStats.count || 0;

      // If sample is too small, fall back to regular count
      if (sampleCount < 100) {
        return this.count(tableName, findFilter);
      }

      // Estimate based on sample ratio
      const estimatedCount = Math.round((sampleCount / 1000) * totalCount);
      return estimatedCount;
    } catch (error) {
      // Fall back to regular count if estimation fails
      return this.count(tableName, findFilter);
    }
  }

  insert(
    tableName: string,
    data: object,
    opts: InsertOneOptions = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .insertOne(data, opts)
        .then((res: any) => {
          resolve(res.insertedId.toString());
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  insertMany(
    tableName: string,
    data: object[],
    opts: BulkWriteOptions = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .insertMany(data, opts)
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  findOne(
    tableName: string,
    findFilter: Filter<any>,
    opts: FindOptions = {}
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .findOne(findFilter, opts)
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  find(
    tableName: string,
    findFilter: Filter<any>,
    opts: FindOptions = {}
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .find(findFilter, opts)
        .toArray()
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  aggregate(
    tableName: string,
    pipeline: object[],
    opts: AggregateOptions
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .aggregate(pipeline, opts)
        .toArray()
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  updateOne(
    tableName: string,
    findFilter: Filter<any>,
    updateFilter: UpdateFilter<any>,
    opts: UpdateOptions = {}
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.client
          .db(this.dbName)
          .collection(tableName)
          .updateOne(findFilter, updateFilter, opts)
          .then((res: any) => {
            resolve(res.matchedCount);
          })
          .catch((err: Error) => {
            reject(err);
          });
      } catch (e) {
        reject(e);
      }
    });
  }

  updateMany(
    tableName: string,
    findFilter: object,
    updateFilter: object,
    opts: UpdateOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client
          .db(this.dbName)
          .collection(tableName)
          .updateMany(findFilter, updateFilter, opts)
          .then((res: any) => {
            resolve(res);
          })
          .catch((err: Error) => {
            reject(err);
          });
      } catch (e) {
        reject(e);
      }
    });
  }

  upsertOne(
    tabName: string,
    findFilter: object,
    updateFilter: object,
    opts: UpdateOptions = {}
  ): Promise<number> {
    opts.upsert = true;
    return this.updateOne(tabName, findFilter, updateFilter, opts);
  }
}
