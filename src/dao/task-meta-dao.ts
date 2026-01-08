import { BaseDao } from "./base-dao";

export type TaskMetaData = {
  tid: string;
  itemId: string;
  desc: string;
  startTime: number;
  endTime: number;
};

export class TaskMetaDao extends BaseDao<TaskMetaData> {} 