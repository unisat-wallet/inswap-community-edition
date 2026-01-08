import fs from "fs";
import {
  getPairStructV2,
  getPairStrV2_2,
} from "../src/contract/contract-utils";
import { ContractValidator } from "./validator/src/contract-validator";

global.buffer = { Buffer };

const configFile = require("../conf/config.example.json");
global.config = configFile;

const decimal = require("./validator/data/decimal.json");
const _events = require("./validator/data/events.json");

let validator = new ContractValidator();

const snapshotHeight = parseInt(process.env.SNAPSHOT_HEIGHT || "0");

const targetHeight = process.argv[2] || 100000;
console.log("Cut-off height", targetHeight);

const events = _events.data;

if (snapshotHeight > 0) {
  const fileStr = fs
    .readFileSync(`./build/validator/data/snapshot-${snapshotHeight}.json`)
    .toString();
  validator = ContractValidator.fromJSONString(fileStr);
}

events.detail = events.detail.filter(
  (v) => v.height > snapshotHeight && v.height <= targetHeight
);

// Print the last event
const lastEvent = events.detail[events.detail.length - 1];
console.log("-------------------");
console.log("Final event content:");
if (lastEvent.type === "commit") {
  console.log(JSON.parse(lastEvent.contentBody));
} else {
  console.log(lastEvent);
}

// Analyze and handle incidents
validator.handleEvents(events, decimal);
const result = validator.genResult();

// Modify the format of the pair
if (result.pools) {
  result.pools.forEach((pool) => {
    if (pool.pair.includes("/")) {
      const pairs = getPairStructV2(pool.pair);
      const tick = getPairStrV2_2(pairs.tick0, pairs.tick1);
      pool.pair = tick;
    }
  });
}
if (result.users) {
  result.users.forEach((balance) => {
    if (balance.tick.includes("/")) {
      const pairs = getPairStructV2(balance.tick);
      const tick = getPairStrV2_2(pairs.tick0, pairs.tick1);
      balance.tick = tick;
    }
  });
}

console.log("-------------------");
console.log("Settlement Balance Result:");
console.log(result);

// Generate a new snapshot
const newSnapshotHeight = lastEvent.height;
validator.results = [];
fs.writeFileSync(
  `./build/validator/data/snapshot-${newSnapshotHeight}.json`,
  JSON.stringify(validator, null, 2)
);
console.log("-------------------");
console.log("New snapshot height:", newSnapshotHeight);
