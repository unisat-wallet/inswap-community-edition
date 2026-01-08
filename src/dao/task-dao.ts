import { BaseDao } from "./base-dao";

export type TaskData = {
  tid: string;
  itemId: string;
  address: string;
  done?: boolean;
};

export class TaskDao extends BaseDao<TaskData> {}
