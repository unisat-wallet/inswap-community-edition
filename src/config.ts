import { Config } from "./types/domain";

export enum LoggerLevel {
  debug = 0,
  info,
  warn,
  error,
}

export const baseConfig = {};

export const config = Object.assign(
  {},
  baseConfig,
  require("../conf/config.json").config
) as Config;
