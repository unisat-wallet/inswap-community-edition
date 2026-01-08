export const DUST546 = 546;
export const DUST294 = 294;
export const DUST330 = 330;
export const DUST600 = 600;
export const LP_DECIMAL = "18";
export const PRICE_DECIMAL = "18";
export const UNCONFIRM_HEIGHT = 4194303;
export const PENDING_CURSOR = 1000000000;
export const DEFAULT_DECIMAL = "18";
export const QUERY_LIMIT = 100;
export const MAX_OP_SIZE = 300000;
export const BITCOIN_NAME = {
  FRACTAL_BITCOIN_MAINNET: "FB",
  BITCOIN_MAINNET: "BTC",
  BITCOIN_TESTNET: "tBTC",
  BITCOIN_TESTNET4: "tBTC",
  BITCOIN_SIGNET: "tBTC",
  FRACTAL_BITCOIN_TESTNET: "tFB",
}[process.env.BITCOIN_NETWORK];
export const L1_BITCOIN_NAME = {
  FRACTAL_BITCOIN_MAINNET: "FB",
  BITCOIN_MAINNET: "BTC",
  BITCOIN_TESTNET: "tBTC",
  BITCOIN_TESTNET4: "tBTC",
  BITCOIN_SIGNET: "tBTC",
  FRACTAL_BITCOIN_TESTNET: "tFB",
}[process.env.L1_BITCOIN_NETWORK];
export const TX_CONFIRM_NUM = 6;
export const MIN_TVL = 100; // Otherwise ignore
export const DEFAULT_GAS_TICK = {
  FRACTAL_BITCOIN_MAINNET: "sFB___000",
  BITCOIN_MAINNET: "",
  BITCOIN_TESTNET: "",
  BITCOIN_TESTNET4: "",
  BITCOIN_SIGNET: "",
  FRACTAL_BITCOIN_TESTNET: "test_sats",
}[process.env.BITCOIN_NETWORK];
export const QUOTA_ASSETS = [
  "bBTC___",
  "sBTC___000",
  "sFB___000",
  "bFB_____",
  "sSUSD___000",
  "sSATS___000",
  "bSATS_",
  "sORDI___000",
];
export const ZERO_ADDRESS =
  "bc1prykz5vxt6lgr2tu56np35slhvlc77s7hlajr3qucsrkqwhvp48mq5grvgr";
