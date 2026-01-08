import * as fs from "fs";
import * as path from "path";
import { WritableStreamBuffer } from "stream-buffers";
import winston, { createLogger, format } from "winston";
import { LoggerLevel } from "../config";
import { AsyncTimer } from "./async-timer";
import { getCurDate } from "./utils";

export class DateLogger {
  private timer = new AsyncTimer();

  private map: {
    [key: string]: {
      logger: winston.Logger;
      stream: WritableStreamBuffer;
      filename: string;
      level: string;
    };
  } = {};

  constructor() {
    const create = (filename: string, level: string) => {
      const stream = new WritableStreamBuffer({
        initialSize: 10 * 1024 * 1024,

        incrementAmount: 10 * 1024 * 1024,
      });
      const logger = createLogger({
        level,
        format: format.json(),
        transports: [new winston.transports.Stream({ stream })],
      });

      this.map[filename] = { filename, stream, level, logger };
      return this.map[filename];
    };

    create("debug", "debug");
    create("route", "info");
    create("info", "info");
    create("warn", "warn");
    create("error", "error");
    create("uncaughtException", "error");
    create("fatal", "error");

    this.timer.setInterval(() => {
      for (const filename in this.map) {
        const item = this.map[filename];

        const stream = item.stream;
        const data = stream.getContents() as Buffer;

        if (data) {
          const date = getCurDate();

          const root = path.join(__dirname, `../../logs/${date}/`);
          const res = fs.existsSync(root);
          if (!res) {
            fs.mkdirSync(root, { recursive: true });
          }
          fs.appendFile(
            path.join(__dirname, `../../logs/${date}/${item.filename}.log`),
            data,
            (err) => {
              if (err) {
                console.error(err);
              }
            }
          );
        }
      }
    }, 10000);
  }

  public debug(obj: object & { tag: string; msg: string; [key: string]: any }) {
    if (config.loggerLevel > LoggerLevel.debug) {
      return;
    }
    this.map["debug"].logger.info({ timestamp: Date.now(), ...obj });
  }

  public route(obj: object & { tag?: string; [key: string]: any }) {
    if (config.loggerLevel > LoggerLevel.info) {
      return;
    }
    this.map["route"].logger.info({ timestamp: Date.now(), ...obj });
  }

  public info(obj: object & { tag: string; msg: string; [key: string]: any }) {
    if (config.loggerLevel > LoggerLevel.info) {
      return;
    }
    this.map["info"].logger.info({ timestamp: Date.now(), ...obj });
  }

  public warn(obj: object & { tag: string; msg: string; [key: string]: any }) {
    if (config.loggerLevel > LoggerLevel.warn) {
      return;
    }
    this.map["warn"].logger.warn({ timestamp: Date.now(), ...obj });
  }

  public error(obj: object & { tag: string; msg: string; [key: string]: any }) {
    if (config.loggerLevel > LoggerLevel.error) {
      return;
    }
    this.map["error"].logger.error({ timestamp: Date.now(), ...obj });
  }

  public fatal(obj: object & { tag: string; msg: string; [key: string]: any }) {
    this.map["fatal"].logger.error({ timestamp: Date.now(), ...obj });
  }
}
