import { ContractValidator } from "./validator/src/contract-validator";

global.buffer = { Buffer };

const configFile = require("../conf/config.example.json");
global.config = configFile;

const decimal = require("./validator/data/decimal.json");
const events = require("./validator/data/events.json");
const expectResult = require("./validator/data/expect-result.json");

const validator = new ContractValidator();
events.detail = events.detail.slice(0, 1);
// events.detail.forEach((v) => {
//   console.log(v);
// });

const d = events.detail[events.detail.length - 1];
if (d.type === "commit") {
  console.log(JSON.parse(d.contentBody));
} else {
  console.log(d);
}

validator.handleEvents(events, decimal);

console.log("verify: ", validator.verify(expectResult));
