import { BaseDao } from "./base-dao";

export type CommunityData = {
  tick: string;
  twitter: string;
  telegram: string;
  website: string;
  discord: string;
  desc: string;
};

export class CommunityDao extends BaseDao<CommunityData> {}
