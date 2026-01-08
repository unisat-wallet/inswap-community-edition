import { BITCOIN_NAME } from "./constant";

export enum CodeEnum {
  commiting = -2,
  user_insufficient_funds = -3,
  sequencer_insufficient_funds = -4,
  internal_api_error = -5,
  fatal_error = -6,
  expired_data = -7,
  exceeding_slippage = -8,
  tick_disable = -9,
  signature_fail = -10,
  system_recovery_in_progress = -11,
}

export class CodeError extends Error {
  readonly code: CodeEnum;
  constructor(message: string, code?: CodeEnum) {
    super(message);
    this.code = code;
  }
}

export function paramsMissing(params: string) {
  return "Params missing: " + params;
}

// The error occurred due to the user's abnormal operation, such as an invalid input.
export const unauthorized_operation = "Unauthorized operation";

// Usually, there is no additional specific information, and the user will see this error message.
export const internal_server_error = "Internal server error";

// The timestamp entered by the user is invalid, such as exceeding 10 minutes or having an invalid format.
export const invalid_ts = "Invalid timestamp";

// All illegal numerical inputs will result in this error (including the user's input of swap or liquidity amount), such as entering a tick value that exceeds its decimal precision or dividing by zero.
export const invalid_amount = "Invalid amount";

// The slippage input is invalid. Currently, the precision is limited to 3 decimal places, which means a maximum step of 0.001. The valid range is from 0 to 1.
export const invalid_slippage = "Invalid slippage";

// This error will be reported if the user's swap balance is insufficient.
export const insufficient_balance = "Insufficient balance";

export const pool_not_found = "Pool not found";

// The address types currently supported by Swap are Ethereum addresses and Binance Smart Chain addresses.
export const not_support_address =
  "Unsupported address type, please switch to taproot or p2wpkh address";

// If the user encounters this error, it means that the unsupported aggregation operation type is not visible to them.
export const invalid_aggregation = "Unsupported aggregation operation";

// When helping a user construct a signed transaction, it is possible to encounter an error indicating insufficient wallet balance.
export const utxo_not_enough = "Available balance is insufficient";

// If a user signs a transaction using a wallet, but the backend verification fails
export const sign_fail = "Signature verification failed";

// If there is insufficient liquidity, it will be displayed on the button similar to how Uniswap shows it.
export const insufficient_liquidity = "Insufficient liquidity for this trade";

// If the user's input value for a swap exceeds the precision of the tick itself, it will result in an error
export const maximum_precision = "Maximum precision of"; // maximum precision of ordi: 18

export const pending_transaction =
  "The transaction in the mempool is pending confirmation, please try again later";

// Currently, only a limited number of users are allowed to access the swap feature.
export const access_denied = "Access denied";

// This indicates that a critical error has occurred in the system, and it requires a shutdown for maintenance
export const system_fatal_error = "System Failure";

// the rollup transaction is being recorded on the blockchain
export const system_commit_in_progress_1 = "System commit in progress .";
export const system_commit_in_progress_2 = "System commit in progress ..";
export const system_commit_in_progress_3 = "System commit in progress ...";

// The on-chain data is abnormal, such as a rollback occurred, prompting the need to rebuild the system state
export const system_recovery_in_progress = "System recovery in progress";

// If there is an aggregation on-chain that occurs during the period from the user's withdrawal signature to confirmation, the withdrawal transaction becomes invalid. In this case, the user needs to perform the withdrawal operation again.
export const expired_data = "Expired data, please try again";

// If a user's deposit is matched with a withdrawal transaction, but the matching verification result is inconsistent between the backend calculation and the node (for example, the backend calculation allows the match while the node does not), the user will be unable to construct a deposit order. In this case, it is recommended to investigate the discrepancy between the backend and node verification processes to ensure consistency and resolve the issue
export const deposit_error = "Deposit error";

// The calculation result of the user's aggregation operation is inconsistent with the real-time verification result of the node.
export const validation_error =
  "Verification error, please retry the operation";

// Currently, only limited ticks are supported.
export const tick_disable = "This tick is not allowed to perform the operation";

// Recharging the relevant ticks within the module is required before executing the deploy pool operation
export const deploy_tick_not_exist = "The does not exist within the module: ";

export const deposit_limit = "The daily deposit limit has been reached.";

export const withdraw_limit = "Less than the minimum cash withdrawal value";

export const deposit_delay_swap = "Deposit in progress, please wait.";

export const insufficient_btc = `Insufficient ${BITCOIN_NAME} balance`;

export const insufficient_confirmed_btc = `Insufficient confirmed ${BITCOIN_NAME} balance`;

export const duplicate_operation = "Duplicate operation.";

export const cant_opt = "The current feature is not yet available";

export const specified_address = "Only supports sending to a specified address";

export const invalid_address = "Invalid address";

export const indexer_error = "Index request error, please try again later.";

export const wait_for_rollup =
  "Waiting for the rollup inscription to be indexed and received";

export const liquidity_too_low = "The added liquidity is too low";

export const current_operations_are_not_allowed =
  "Current operations are not allowed, please wait a moment";

export const fee_tick_invalid = "Invalid fee tick";

export const params_error =
  "Parameter error, please refresh the page and try again";

export const stake_pool_not_exist = "Rewards not available";

export const claimable_zero = "The current claimable amount is 0";

export const staking_over = "The LP Fest activity has ended";

export const staking_not_start = "The LP Fest activity has not started";

export const staking_pool_balance_not_enough =
  "Insufficient balance in the LPfest. Please contact us for support.";

export const exception_locked_amount = "Abnormal locked amount";

export const withdraw_too_low = "Withdraw amount too low";

export const ticker_need_3_confirmations =
  "Need to ensure that both tickets have 3 confirmations";

export const invalid_time_uint = "Invalid time uint";

export const invalid_lock_day = "Invalid lock day";

export const invalid_multi_swap_params = "Invalid multi swap params";
