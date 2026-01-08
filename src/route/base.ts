import { FastifyInstance } from "fastify";
import Joi from "joi";
import { bn, bnGte, decimalCal } from "../contract/bn";
import {
  getPairStructV2,
  getPairStrV2,
  invalid_amount,
  need,
} from "../contract/contract-utils";
import { CommunityData } from "../dao/community-dao";
import { DepositData } from "../dao/deposit-dao";
import { LpRewardHistoryData } from "../dao/lp-reward-history-dao";
import { MatchingData } from "../dao/matching-dao";
import { RecordUnlockLpData } from "../dao/record-unlock-lp-dao";
import { WithdrawData } from "../dao/withdraw-dao";

import {
  PENDING_CURSOR,
  QUERY_LIMIT,
  UNCONFIRM_HEIGHT,
} from "../domain/constant";
import {
  cant_opt,
  claimable_zero,
  deploy_tick_not_exist,
  insufficient_balance,
  invalid_multi_swap_params,
  liquidity_too_low,
  params_error,
  paramsMissing,
  ticker_need_3_confirmations,
  withdraw_too_low,
} from "../domain/error";
import {
  checkAddressType,
  checkLockDay,
  getAddressType,
  getConfirmedNum,
  getL1NetworkType,
  isLp,
  l1ToL2TickName,
  l2ToL1TickName,
} from "../domain/utils";
import {
  BridgeConfirmDepositReq,
  BridgeConfirmWithdrawReq,
  BridgeCreateDepositReq,
  BridgeType,
} from "../lib/bridge-api/types";
import { ExactType, FuncType } from "../types/func";
import {
  AddCommunityInfoReq,
  AddCommunityInfoRes,
  AddLiqReq,
  AddLiqRes,
  AddressBalanceReq,
  AddressBalanceRes,
  AddressGasReq,
  AddressGasRes,
  AllAddressBalanceReq,
  AllAddressBalanceRes,
  AssetsUSDReq,
  AssetsUSDRes,
  BatchFuncReq,
  BatchSendReq,
  BatchSendRes,
  BurnHistoryItem,
  BurnHistoryReq,
  BurnHistoryRes,
  ClaimReq,
  ClaimRes,
  CommunityInfoReq,
  CommunityInfoRes,
  CommunityListReq,
  CommunityListRes,
  ConditionalWithdrawHistoryItem,
  ConfigReq,
  ConfigRes,
  ConfirmDepositReq,
  ConfirmDirectWithdrawReq,
  ConfirmRetryWithdrawReq,
  ConfirmRetryWithdrawRes,
  ConfirmWithdrawRes,
  CreateDepositReq,
  CreateDepositRes,
  CreateDirectWithdrawReq,
  CreateDirectWithdrawRes,
  CreateRetryWithdrawReq,
  CreateRetryWithdrawRes,
  DeployPoolReq,
  DeployPoolRes,
  DepositBalanceReq,
  DepositBalanceRes,
  DepositListItem,
  DepositListReq,
  DepositListRes,
  DepositProcessReq,
  DepositProcessRes,
  ExportLockLpHistoryReq,
  FuncInfoReq,
  FuncInfoRes,
  FuncReq,
  GasHistoryItem,
  GasHistoryReq,
  GasHistoryRes,
  LiqHistoryItem,
  LiqHistoryReq,
  LiqHistoryRes,
  LockLpHistoryReq,
  LockLpHistoryRes,
  LockLpItem,
  LockLpReq,
  LockLpRes,
  LpRewardHistoryReq,
  LpRewardHistoryRes,
  MultiSwapHistoryItem,
  MultiSwapHistoryRes,
  MultiSwapHistoryResItem,
  MultiSwapReq,
  MultiSwapRes,
  MyPoolListItem,
  MyPoolListReq,
  MyPoolListRes,
  MyPoolReq,
  MyPoolRes,
  NetworkType,
  OverViewReq,
  OverViewRes,
  PayType,
  PoolHoldersReq,
  PoolHoldersRes,
  PoolInfoReq,
  PoolInfoRes,
  PoolListItem,
  PoolListReq,
  PoolListRes,
  PreLockLpRes,
  PreRemoveLiqRes,
  PreRes,
  PreSendLpRes,
  PreUnlockLpRes,
  PriceLineReq,
  PriceLineRes,
  QuoteAddLiqReq,
  QuoteAddLiqRes,
  QuoteMultiSwapRes,
  QuoteRemoveLiqReq,
  QuoteRemoveLiqRes,
  QuoteSwapReq,
  QuoteSwapRes,
  RecordLockLpItem,
  RemoveLiqReq,
  RemoveLiqRes,
  Req,
  Res,
  RewardCurveReq,
  RewardCurveRes,
  RollUpHistoryItem,
  RollUpHistoryReq,
  RollUpHistoryRes,
  SelectDepositReq,
  SelectDepositRes,
  SelectPoolReq,
  SelectPoolRes,
  SelectReq,
  SelectRes,
  SendHistoryItem,
  SendHistoryReq,
  SendHistoryRes,
  SendLpHistoryItem,
  SendLpHistoryReq,
  SendLpHistoryRes,
  SendLpReq,
  SendReq,
  SendRes,
  StakeHistoryReq,
  StakeHistoryRes,
  StakeItemReq,
  StakeItemRes,
  StakeListReq,
  StakeListRes,
  StakeReq,
  StakeRes,
  StakeUserInfoReq,
  StakeUserInfoRes,
  SwapAssetItem,
  SwapHistoryItem,
  SwapHistoryReq,
  SwapHistoryRes,
  SwapReq,
  SwapRes,
  SystemStatusReq,
  SystemStatusRes,
  TaskListReq,
  TaskListRes,
  TickHoldersReq,
  TickHoldersRes,
  TickPriceReq,
  TickPriceRes,
  UnlockLpHistoryReq,
  UnlockLpHistoryRes,
  UnLockLpReq,
  UnLockLpRes,
  UnstakeReq,
  UnstakeRes,
  UserInfoReq,
  UserInfoRes,
  UserLockLpInfoReq,
  UserLockLpInfoRes,
  WithdrawHistoryReq,
  WithdrawHistoryRes,
  WithdrawProcessReq,
  WithdrawProcessRes,
} from "../types/route";
import { getAddress, schema, sha256 } from "../utils/utils";

export function baseRoute(fastify: FastifyInstance, opts, done) {
  fastify.get(
    `/config`,
    schema(
      Joi.object<ConfigReq>({}),
      "get",
      Joi.object<ConfigRes>({
        moduleId: Joi.string(),
        serviceGasTick: Joi.string().description(
          "The tick used for the second layer gas."
        ),
        pendingDepositDirectNum: Joi.number().description(
          "Number of confirmations required for direct deposit."
        ),
        pendingDepositMatchingNum: Joi.number().description(
          "Number of confirmations required for matching deposit."
        ),
      }),
      { summary: "Swap's global configuration information.", apiDoc: true }
    ),
    async (req: Req<ConfigReq, "get">, res: Res<ConfigRes>) => {
      const ret: ConfigRes = {
        moduleId: config.moduleId,
        serviceGasTick: env.ModuleInitParams.gas_tick,
        pendingDepositDirectNum: config.pendingDepositDirectNum,
        pendingDepositMatchingNum: config.pendingDepositMatchingNum,
        userWhiteList: config.userWhiteList,
        onlyUserWhiteList: config.onlyUserWhiteList,
        tickWhiteList: Object.keys(config.whitelistTick),
        onlyTickWhiteList: config.openWhitelistTick,
        binOpts: config.binOpts,
        commitPerMinute: config.commitPerMinute,
        pendingTransferNum: config.pendingTransferNum,
        feeTicks: config.feeTicks,
        btcBridgeConfig: await api.bridgeConfig(NetworkType.BITCOIN_MAINNET),
        fbBridgeConfig: await api.bridgeConfig(
          NetworkType.FRACTAL_BITCOIN_MAINNET
        ),
      };
      void res.send(ret);
    }
  );

  fastify.get(
    `/balance`,
    schema(
      Joi.object<AddressBalanceReq>({
        address: Joi.string().required(),
        tick: Joi.string().required(),
      }),
      "get",
      Joi.object<AddressBalanceRes>({
        balance: Joi.object({
          module: Joi.string().description("Confirmed module balance."),
          swap: Joi.string().description("Confirmed swap balance."),
          pendingSwap: Joi.string().description(
            "The balance converted from pending to swap."
          ),
          pendingAvailable: Joi.string().description(
            "The balance converted from pending to module."
          ),
        }),
        decimal: Joi.string(),
      }),
      {
        summary: "Gets the balance for the specified address and tick.",
        apiDoc: true,
      }
    ),
    async (req: Req<AddressBalanceReq, "get">, res: Res<AddressBalanceRes>) => {
      const { address, tick } = req.query;
      await decimal.trySetting(tick);
      const balance = operator.PendingSpace.getTickBalance(address, tick);
      void res.send({
        balance,
        decimal: decimal.get(tick),
      });
    }
  );

  fastify.get(
    `/all_balance`,
    schema(
      Joi.object<AllAddressBalanceReq>({
        address: Joi.string().required(),
        pubkey: Joi.string(),
      }),
      "get",
      Joi.object<AllAddressBalanceRes>().pattern(
        Joi.string(),
        Joi.object().keys({
          balance: Joi.object({
            module: Joi.string(),
            swap: Joi.string(),
            pendingSwap: Joi.string(),
            pendingAvailable: Joi.string(),
          }),
          decimal: Joi.string(),
          withdrawLimit: Joi.string(),
        })
      ),
      { summary: "", apiDoc: false } // TOFIX
    ),
    async (
      req: Req<AllAddressBalanceReq, "get">,
      res: Res<AllAddressBalanceRes>
    ) => {
      const ret = await query.getAllBalance(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/quote_swap`,
    schema(
      Joi.object<QuoteSwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amount: Joi.string()
          .required()
          .description(
            "If it is exactIn, it is the amount of input tick, else is the amount of output tick"
          ),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required()
          .description("Exact input or exact output")
          .example(ExactType.exactIn),
      }),
      "get",
      Joi.object<QuoteSwapRes>({
        amountUSD: Joi.string().description("Input amount of usd value"),
        expectUSD: Joi.string().description("Estimated amount of usd value"),
        expect: Joi.string().description("Estimated amount"),
      }),
      {
        summary:
          "Returns the estimated number of swaps based on the input and exact type.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteSwapReq, "get">, res: Res<QuoteSwapRes>) => {
      const params = req.query;
      const ret = await operator.quoteSwap(params);
      void res.send(ret);
    }
  );

  fastify.get(
    `/quote_add_liq`,
    schema(
      Joi.object<QuoteAddLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().description("The expect amount of tick0"),
        amount1: Joi.string().description("The expect amount of tick1"),
      }),
      "get",
      Joi.object<QuoteAddLiqRes>({
        amount0: Joi.string().description("The real amount of tick0"),
        amount1: Joi.string().description("The real amount of tick1"),
        amount0USD: Joi.string().description("The usd value of amount0"),
        amount1USD: Joi.string().description("The usd value of amount0"),
        lp: Joi.string().description("Estimated lp"),
        tick0PerTick1: Joi.string().description("tick0/tick1"),
        tick1PerTick0: Joi.string().description("tick1/tick0"),
        shareOfPool: Joi.string().description(
          "The proportion of the injected quantity in the pool"
        ),
      }),
      {
        summary:
          "Based on the pair to get the actual addition ratio, LP number and other information.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteAddLiqReq, "get">, res: Res<QuoteAddLiqRes>) => {
      const params = req.query;

      try {
        const ret = await operator.quoteAddLiq(params);
        void res.send(ret);
      } catch (err) {
        throw new Error(liquidity_too_low);
      }
    }
  );

  fastify.get(
    `/quote_remove_liq`,
    schema(
      Joi.object<QuoteRemoveLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        lp: Joi.string().required(),
      }),
      "get",
      Joi.object<QuoteRemoveLiqRes>({
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Amount of tick0"),
        amount1: Joi.string().required().description("Amount of tick1"),
        amount0USD: Joi.string(),
        amount1USD: Joi.string(),
      }),
      {
        summary: "Estimate the number of ticks you can get by typing LP.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteRemoveLiqReq, "get">, res: Res<QuoteRemoveLiqRes>) => {
      const params = req.query;
      const ret = await operator.quoteRemoveLiq(params);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pool_info`,
    schema(
      Joi.object<PoolInfoReq>({
        tick0: Joi.string(),
        tick1: Joi.string(),
      }),
      "get",
      Joi.object<PoolInfoRes>({
        existed: Joi.boolean().description("Is the pool existed"),
        addLiq: Joi.boolean().description("Has LP been added to the pool"),
        tick0: Joi.string(),
        tick1: Joi.string(),
        lp: Joi.string().description("Quantity of pool lp"),
        tvl: Joi.string(),
        volume24h: Joi.string(),
        volume7d: Joi.string(),
        reward0: Joi.string(),
        reward1: Joi.string(),
      }),
      { summary: "Get Pool information based on trade pair.", apiDoc: true }
    ),
    async (req: Req<PoolInfoReq, "get">, res: Res<PoolInfoRes>) => {
      const ret = await query.poolInfo(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/select`,
    schema(
      Joi.object<SelectReq>({
        address: Joi.string().required(),
        search: Joi.string().description("Fuzzy matching"),
      }),
      "get",
      Joi.array<SelectRes>().items(
        Joi.object({
          tick: Joi.string(),
          decimal: Joi.string(),
          brc20Balance: Joi.string().description(
            "Module balance (not participate in swap calculations)"
          ),
          swapBalance: Joi.string().description("Swap balance"),
        })
      ),
      {
        summary:
          "Select the tick information that you can use based on the address.",
        apiDoc: true,
      }
    ),
    async (req: Req<SelectReq, "get">, res: Res<SelectRes>) => {
      let ret = await query.getSelect(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_deploy_pool`,
    schema(
      Joi.object<DeployPoolReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/deploy_pool interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<DeployPoolReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.deployPool,
        req: req.query,
      } as FuncReq;
      const ret = await operator.genPreRes(params);
      void res.send(ret);
    }
  );

  fastify.post(
    `/deploy_pool`,
    schema(
      Joi.object<DeployPoolReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<DeployPoolRes>({}),
      { summary: "Deploy the pool operation.", apiDoc: true }
    ),
    async (req: Req<DeployPoolReq, "post">, res: Res<DeployPoolRes>) => {
      const { tick0, tick1 } = req.body;
      need(!!decimal.get(tick0, false), deploy_tick_not_exist + tick0);
      need(!!decimal.get(tick1, false), deploy_tick_not_exist + tick1);

      // Need to ensure that both tikers have enough confirmations
      const tick0Info = await api.brc20Info(tick0);
      need(
        getConfirmedNum(tick0Info.deployHeight) >= 3,
        ticker_need_3_confirmations
      );
      const tick1Info = await api.brc20Info(tick1);
      need(
        getConfirmedNum(tick1Info.deployHeight) >= 3,
        ticker_need_3_confirmations
      );

      await operator.aggregate({
        func: FuncType.deployPool,
        req: req.body,
      });
      void res.send({});
    }
  );

  fastify.get(
    `/pre_add_liq`,
    schema(
      Joi.object<AddLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string().required().description("Expect amount of lp"),
        slippage: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/add_liq interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<AddLiqReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.addLiq,
        req: req.query,
      } as FuncReq;
      const ret = await operator.genPreRes(params);
      void res.send(ret);
    }
  );

  fastify.post(
    `/add_liq`,
    schema(
      Joi.object<AddLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string().required(),
        slippage: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<AddLiqRes>({
        id: Joi.string().description("Function id"),
        rollupInscriptionId: Joi.string().description(
          "The rollup inscription id where the function is located"
        ),
        address: Joi.string(),
        type: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string(),
        ts: Joi.number(),
      }),
      { summary: "Add the liquidity operation.", apiDoc: true }
    ),
    async (req: Req<AddLiqReq, "post">, res: Res<AddLiqRes>) => {
      const ret = (await operator.aggregate({
        func: FuncType.addLiq,
        req: req.body,
      })) as AddLiqRes;
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_remove_liq`,
    schema(
      Joi.object<RemoveLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string().required(),
        slippage: Joi.string().required(),
        ts: Joi.number().required(),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRemoveLiqRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/remove_liq interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<RemoveLiqReq, "get">, res: Res<PreRemoveLiqRes>) => {
      const params = {
        func: FuncType.removeLiq,
        req: req.query,
      } as FuncReq;
      const ret = await operator.genPreRes(params);

      const { tick0, tick1, address, lp } = req.query;
      const pair = getPairStrV2(tick0, tick1);
      const { tick0: sortTick0, tick1: sortTick1 } = getPairStructV2(pair);
      const reward = operator.PendingSpace.LpReward.getUserReward(
        pair,
        address,
        lp
      );
      void res.send({
        ...ret,
        reward0: tick0 == sortTick0 ? reward.reward0 : reward.reward1,
        reward1: tick1 == sortTick1 ? reward.reward1 : reward.reward0,
      });
    }
  );

  fastify.post(
    `/remove_liq`,
    schema(
      Joi.object<RemoveLiqReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        lp: Joi.string().required(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        slippage: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<RemoveLiqRes>({
        id: Joi.string().description("Function id"),
        rollupInscriptionId: Joi.string().description(
          "The rollup inscription id where the function is located"
        ),
        address: Joi.string(),
        type: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Input amount of tick0"),
        amount1: Joi.string().required().description("Input amount of tick1"),
        lp: Joi.string(),
        ts: Joi.number(),
      }),
      { summary: "Remove the liquidity operation", apiDoc: true }
    ),
    async (req: Req<RemoveLiqReq, "post">, res: Res<RemoveLiqRes>) => {
      const ret = (await operator.aggregate({
        func: FuncType.removeLiq,
        req: req.body,
      })) as RemoveLiqRes;
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_stake`,
    schema(
      Joi.object<StakeReq>({
        pid: Joi.string().required(),
        address: Joi.string().required(),
        amount: Joi.string().required().description("The amount of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/send interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<StakeReq, "get">, res: Res<PreRes>) => {
      const stakePool = stakePoolMgr.getStakePool(req.query.pid);
      const { address, amount, feeTick, ts } = req.query;

      const params = {
        func: FuncType.lock,
        req: {
          address,
          tick0: stakePool.tick0,
          tick1: stakePool.tick1,
          amount,
          feeTick,
          ts,
          payType: req.query.payType,
        },
      } as FuncReq;
      try {
        const ret = await operator.genPreRes(params);
        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.get(
    `/pre_unstake`,
    schema(
      Joi.object<UnstakeReq>({
        pid: Joi.string().required(),
        address: Joi.string().required(),
        amount: Joi.string().required().description("The amount of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/send interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<UnstakeReq, "get">, res: Res<PreRes>) => {
      const stakePool = stakePoolMgr.getStakePool(req.query.pid);
      const { address, amount, feeTick, ts } = req.query;

      const params = {
        func: FuncType.unlock,
        req: {
          address,
          tick0: stakePool.tick0,
          tick1: stakePool.tick1,
          amount,
          feeTick,
          ts,
          payType: req.query.payType,
        },
      } as FuncReq;
      try {
        const ret = await operator.genPreRes(params);
        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.get(
    `/pre_claim`,
    schema(
      Joi.object<ClaimReq>({
        pid: Joi.string().required(),
        address: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/send interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<ClaimReq, "get">, res: Res<PreRes>) => {
      const stakePool = stakePoolMgr.getStakePool(req.query.pid);

      const { address } = req.query;
      const amount = stakePool.getUnclaimed(address);
      need(bn(amount).gt("0"), claimable_zero);

      const params = {
        func: FuncType.claim,
        req: req.query,
      } as FuncReq;
      try {
        const ret = await operator.genPreRes(params);
        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.get(
    `/pre_send`,
    schema(
      Joi.object<SendReq>({
        address: Joi.string().required(),
        tick: Joi.string().required().description("Send tick"),
        amount: Joi.string().required().description("The amount of send tick"),
        to: Joi.string().required().description("The receiver of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/send interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<SendReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.send,
        req: req.query,
      } as FuncReq;

      try {
        const ret = await operator.genPreRes(params);
        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.get(
    `/pre_send_lp`,
    schema(
      Joi.object<SendLpReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required().description("Lp tick0"),
        tick1: Joi.string().required().description("Lp tick1"),
        amount: Joi.string().required().description("The amount of send tick"),
        to: Joi.string().required().description("The receiver of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/send_lp interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<SendLpReq, "get">, res: Res<PreSendLpRes>) => {
      const { tick0, tick1 } = req.query;
      const tick = getPairStrV2(tick0, tick1);
      const params: SendReq = {
        address: req.query.address,
        tick,
        amount: req.query.amount,
        to: req.query.to,
        ts: req.query.ts,
        feeTick: req.query.feeTick,
        feeAmount: req.query.feeAmount,
        feeTickPrice: req.query.feeTickPrice,
        payType: req.query.payType,
      };

      try {
        const ret = (await operator.genPreRes({
          func: FuncType.sendLp,
          req: params,
        })) as PreSendLpRes;

        const info = await operator.quoteRemoveLiq({
          address: "",
          tick0,
          tick1,
          lp: "1",
        });
        ret.amount0PerLp = info.amount0;
        ret.amount1PerLp = info.amount1;

        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.get(
    `/pre_swap`,
    schema(
      Joi.object<SwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amountIn: Joi.string()
          .required()
          .description("The amount of input tick"),
        amountOut: Joi.string()
          .required()
          .description("The amount of output tick"),
        slippage: Joi.string().required(),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required()
          .example(ExactType.exactIn),
        ts: Joi.number().required().description("Timestamp(seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/swap interface pre-load, get the signature content and gas information.",
        apiDoc: true,
      }
    ),
    async (req: Req<SwapReq, "get">, res: Res<PreRes>) => {
      const params = {
        func: FuncType.swap,
        req: req.query,
      } as FuncReq;
      const ret = await operator.genPreRes(params);
      void res.send(ret);
    }
  );

  fastify.post(
    `/send_lp`,
    schema(
      Joi.object<SendLpReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required().description("Lp tick0"),
        tick1: Joi.string().required().description("Lp tick1"),
        amount: Joi.string().required().description("The amount of send tick"),
        to: Joi.string().required().description("The receiver of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<SendRes>({}),
      { summary: "The send operation.", apiDoc: true }
    ),
    async (req: Req<SendLpReq, "post">, res: Res<SendRes>) => {
      checkAddressType(req.body.address);
      checkAddressType(req.body.to);

      const { tick0, tick1 } = req.body;
      const tick = getPairStrV2(tick0, tick1);
      const params: SendReq = {
        address: req.body.address,
        tick,
        amount: req.body.amount,
        to: req.body.to,
        ts: req.body.ts,
        feeTick: req.body.feeTick,
        feeAmount: req.body.feeAmount,
        feeTickPrice: req.body.feeTickPrice,
        payType: req.body.payType,
        sigs: req.body.sigs,
      };

      need(isLp(params.tick), cant_opt);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      const ret = await operator.aggregate({
        func: FuncType.sendLp,
        req: params,
      });
      void res.send(ret);
    }
  );

  fastify.post(
    `/send`,
    schema(
      Joi.object<SendReq>({
        address: Joi.string().required(),
        tick: Joi.string().required().description("Send tick"),
        amount: Joi.string().required().description("The amount of send tick"),
        to: Joi.string().required().description("The receiver of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
        assetFeeTick: Joi.string(),
        assetFeeAmount: Joi.string(),
        assetFeeTickPrice: Joi.string(),
      }),
      "post",
      Joi.object<SendRes>({}),
      { summary: "The send operation.", apiDoc: true }
    ),
    async (req: Req<SendReq, "post">, res: Res<SendRes>) => {
      checkAddressType(req.body.address);
      checkAddressType(req.body.to);
      need(!isLp(req.body.tick), cant_opt);
      // need(
      //   ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
      //     req.body.address
      //   ),
      //   params_error
      // );
      const ret = await operator.aggregate({
        func: FuncType.send,
        req: req.body,
      });
      void res.send(ret);
    }
  );

  fastify.post(
    `/stake`,
    schema(
      Joi.object<StakeReq>({
        pid: Joi.string().required(),
        address: Joi.string().required(),
        amount: Joi.string().required().description("The amount of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<StakeRes>({}),
      { summary: "The stake operation.", apiDoc: true }
    ),
    async (req: Req<StakeReq, "post">, res: Res<StakeRes>) => {
      checkAddressType(req.body.address);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      const ret = await stake.stake(req.body);
      void res.send(ret);
    }
  );

  fastify.post(
    `/unstake`,
    schema(
      Joi.object<UnstakeReq>({
        pid: Joi.string().required(),
        address: Joi.string().required(),
        amount: Joi.string().required().description("The amount of send tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<UnstakeRes>({}),
      { summary: "The unstake operation.", apiDoc: true }
    ),
    async (req: Req<UnstakeReq, "post">, res: Res<UnstakeRes>) => {
      checkAddressType(req.body.address);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      const ret = await stake.unstake(req.body);
      void res.send(ret);
    }
  );

  fastify.post(
    `/claim`,
    schema(
      Joi.object<ClaimReq>({
        pid: Joi.string().required(),
        address: Joi.string().required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array().items(Joi.string()).description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<ClaimRes>({}),
      { summary: "The unstake operation.", apiDoc: true }
    ),
    async (req: Req<ClaimReq, "post">, res: Res<ClaimRes>) => {
      need(!config.readonly, cant_opt);
      checkAddressType(req.body.address);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      const ret = await stake.claim(req.body);
      void res.send(ret);
    }
  );

  fastify.post(
    `/swap`,
    schema(
      Joi.object<SwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amountIn: Joi.string()
          .required()
          .description("The amount of input tick"),
        amountOut: Joi.string()
          .required()
          .description("The amount of output tick"),
        feeTick: Joi.string().required(),
        slippage: Joi.string().required(),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required(),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
        assetFeeTick: Joi.string(),
        assetFeeAmount: Joi.string(),
        assetFeeTickPrice: Joi.string(),
      }),
      "post",
      Joi.object<SwapRes>({
        id: Joi.string().description("Function id"),
        rollupInscriptionId: Joi.string().description(
          "The rollup inscription id where the function is located"
        ),
        address: Joi.string(),
        tickIn: Joi.string(),
        tickOut: Joi.string(),
        amountIn: Joi.string(),
        amountOut: Joi.string(),
        exactType: Joi.string(),
        ts: Joi.number(),
      }),
      { summary: "The swap operation.", apiDoc: true }
    ),
    async (req: Req<SwapReq, "post">, res: Res<SwapRes>) => {
      checkAddressType(req.body.address);
      need(!config.binOpts.includes("swap"), cant_opt);
      const ret = (await operator.aggregate({
        func: FuncType.swap,
        req: req.body,
      })) as SwapRes;
      void res.send(ret);
    }
  );

  fastify.get(
    `/pool_list`,
    schema(
      Joi.object<PoolListReq>({
        search: Joi.string().description("Fuzzy matching"),
        sort: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<PoolListRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<PoolListItem>({
            tick0: Joi.string(),
            tick1: Joi.string(),
            lp: Joi.string(),
            tvl: Joi.string().description("Total pool value"),
            volume24h: Joi.string(),
            volume7d: Joi.string(),
            reward0: Joi.string(),
            reward1: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the pool list information.", apiDoc: true }
    ),
    async (req: Req<PoolListReq, "get">, res: Res<PoolListRes>) => {
      const ret = await query.poolList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/my_pool_list`,
    schema(
      Joi.object<MyPoolListReq>({
        address: Joi.string().required(),
        tick: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
        sortField: Joi.string().default("liq"),
        sortType: Joi.string().default("desc"),
      }),
      "get",
      Joi.object<MyPoolListRes>({
        total: Joi.number(),
        totalLpUSD: Joi.string(),
        list: Joi.array().items(
          Joi.object<MyPoolListItem>({
            lp: Joi.string(),
            shareOfPool: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            amount0: Joi.string().required().description("Amount of tick0"),
            amount1: Joi.string().required().description("Amount of tick1"),
            claimedReward0: Joi.string(),
            claimedReward1: Joi.string(),
            unclaimedReward0: Joi.string(),
            unclaimedReward1: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the pool list information by address.", apiDoc: true }
    ),
    async (req: Req<MyPoolListReq, "get">, res: Res<MyPoolListRes>) => {
      const ret = await query.myPoolList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/lp_reward_history`,
    schema(
      Joi.object<LpRewardHistoryReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<LpRewardHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<LpRewardHistoryData>({
            id: Joi.string(),
            type: Joi.string(),
            address: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            reward0: Joi.string(),
            reward1: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary: "Gets the user pool information for the specified pair.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<LpRewardHistoryReq, "get">,
      res: Res<LpRewardHistoryRes>
    ) => {
      const ret = await query.lpRewardHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/my_pool`,
    schema(
      Joi.object<MyPoolReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        ts: Joi.number(),
      }),
      "get",
      Joi.object<MyPoolRes>({
        lp: Joi.string(),
        lockedLp: Joi.string(),
        shareOfPool: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        amount0: Joi.string().required().description("Amount of tick0"),
        amount1: Joi.string().required().description("Amount of tick1"),
        claimedReward0: Joi.string(),
        claimedReward1: Joi.string(),
        unclaimedReward0: Joi.string(),
        unclaimedReward1: Joi.string(),
      }),
      {
        summary: "Gets the user pool information for the specified pair.",
        apiDoc: true,
      }
    ),
    async (req: Req<MyPoolReq, "get">, res: Res<MyPoolRes>) => {
      const ret = await query.myPool(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/overview`,
    schema(
      Joi.object<OverViewReq>({}),
      "get",
      Joi.object({
        liquidity: Joi.string().description("Total value of all pools"),
        volume7d: Joi.string().description("7 days volume"),
        volume24h: Joi.string().description("24 hours volume"),
        transactions: Joi.number().description(
          "Number of transactions in 24 hours"
        ),
        pairs: Joi.number(),
      }),
      { summary: "An overview of swap information", apiDoc: true }
    ),
    async (req: Req<OverViewReq, "get">, res: Res<OverViewRes>) => {
      const ret = await query.overview(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/gas_history`,
    schema(
      Joi.object<GasHistoryReq>({
        address: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<GasHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<GasHistoryItem>({
            funcType: Joi.string()
              .description("Function type")
              .example(FuncType.swap),
            tickA: Joi.string(),
            tickB: Joi.string(),
            gas: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary:
          "Gets the gas consumption records for a user aggregation operation.",
        apiDoc: true,
      }
    ),
    async (req: Req<GasHistoryReq, "get">, res: Res<GasHistoryRes>) => {
      const ret = await query.gasHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/send_history`,
    schema(
      Joi.object<SendHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        fuzzySearch: Joi.boolean(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<SendHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<SendHistoryItem>({
            tick: Joi.string(),
            amount: Joi.string(),
            to: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of send transaction.", apiDoc: true }
    ),
    async (req: Req<SendHistoryReq, "get">, res: Res<SendHistoryRes>) => {
      const ret = await query.sendHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/liq_history`,
    schema(
      Joi.object<LiqHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        fuzzySearch: Joi.boolean(),
        type: Joi.string().description("Optional: add, remove"),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
        ts: Joi.number(),
      }),
      "get",
      Joi.object<LiqHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<LiqHistoryItem>({
            type: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            amount0: Joi.string(),
            amount1: Joi.string(),
            lp: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of a pair addition pool.", apiDoc: true }
    ),
    async (req: Req<LiqHistoryReq, "get">, res: Res<LiqHistoryRes>) => {
      const ret = await query.liqHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/swap_history`,
    schema(
      Joi.object<SwapHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        fuzzySearch: Joi.boolean(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<SwapHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<SwapHistoryItem>({
            tickIn: Joi.string().required().description("Input tick"),
            tickOut: Joi.string().required().description("Output tick"),
            amountIn: Joi.string()
              .required()
              .description("The amount of input tick"),
            amountOut: Joi.string()
              .required()
              .description("The amount of output tick"),
            exactType: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of swap.", apiDoc: true }
    ),
    async (req: Req<SwapHistoryReq, "get">, res: Res<SwapHistoryRes>) => {
      const ret = await query.swapHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/rollup_history`,
    schema(
      Joi.object<RollUpHistoryReq>({
        start: Joi.number().required(),
        limit: Joi.number().less(1000).required(),
      }),
      "get",
      Joi.object<RollUpHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<RollUpHistoryItem>({
            txid: Joi.string(),
            height: Joi.number(),
            transactionNum: Joi.number().description(
              "Number of transactions in the inscription"
            ),
            inscriptionId: Joi.string().description("Rollup inscription id"),
            inscriptionNumber: Joi.number().description(
              "Rollup inscription number"
            ),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Get chain history of rollup inscription.", apiDoc: true }
    ),
    async (req: Req<RollUpHistoryReq, "get">, res: Res<RollUpHistoryRes>) => {
      const ret = await query.rollUpHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/deposit_list`,
    schema(
      Joi.object<DepositListReq>({
        address: Joi.string().required(),
        pubkey: Joi.string(),
        tick: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<DepositListRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<DepositListItem>({
            tick: Joi.string(),
            amount: Joi.string(),
            cur: Joi.number().description("Current number of confirmations"),
            sum: Joi.number().description("Total number of confirmations"),
            ts: Joi.number(),
            txid: Joi.string(),
            type: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the deposit list for a user.", apiDoc: true }
    ),
    async (req: Req<DepositListReq, "get">, res: Res<DepositListRes>) => {
      const ret = await query.depositHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_deposit`,
    schema(
      Joi.object<CreateDepositReq>({
        inscriptionId: Joi.string(),
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
        amount: Joi.string(),
        tick: Joi.string(),
        assetType: Joi.string(),
        networkType: Joi.string(),
        feeRate: Joi.number(),
      }),
      "get",
      Joi.object({
        psbt: Joi.string(),
        type: Joi.string().description("Direct or matching"),
        expiredTimestamp: Joi.number(),
        recommendDeposit: Joi.string(),
      }),
      {
        summary: "Create a deposit psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (req: Req<CreateDepositReq, "get">, res: Res<CreateDepositRes>) => {
      checkAddressType(req.query.address);

      const { amount, address, pubkey, tick, inscriptionId, feeRate } =
        req.query;
      const networkType =
        req.query.networkType || NetworkType.FRACTAL_BITCOIN_MAINNET;
      const assetType = req.query.assetType || "brc20";
      const isFractal =
        networkType == NetworkType.FRACTAL_BITCOIN_MAINNET ||
        networkType == NetworkType.FRACTAL_BITCOIN_TESTNET;
      const isBrc20 = assetType == "brc20";
      if (isFractal && isBrc20) {
        const ret = await deposit.create(req.query);
        void res.send(ret);
      } else {
        need(!!amount, paramsMissing("amount"));
        need(!!tick, paramsMissing("tick"));
        need(!!req.query.assetType, paramsMissing("assetType"));
        need(!!req.query.networkType, paramsMissing("networkType"));
        const params: BridgeCreateDepositReq = {
          amount,
          address: getAddress(getAddressType(address), pubkey, networkType),
          pubkey,
          l1AssetType: assetType,
          bridgeType: BridgeType.swap,
          tick,
          inscriptionId,
          feeRate,
        };
        const res0 = await api.createBridgeDeposit(params, networkType);
        const ret: CreateDepositRes = {
          psbt: res0.psbt,
          type: "bridge",
          expiredTimestamp: null,
          recommendDeposit: null,
        };
        void res.send(ret);
      }
    }
  );

  fastify.post(
    `/confirm_deposit`,
    schema(
      Joi.object<ConfirmDepositReq>({
        inscriptionId: Joi.string(),
        psbt: Joi.string().required(),
        pubkey: Joi.string(),
        address: Joi.string(),
        amount: Joi.string(),
        tick: Joi.string(),
        assetType: Joi.string(),
        networkType: Joi.string(),
        feeRate: Joi.number(),
      }),
      "post",
      Joi.object({}),
      {
        summary: "User signature deposit psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (req: Req<ConfirmDepositReq, "post">, res) => {
      const { psbt, amount, address, pubkey, tick } = req.body;
      const networkType =
        req.body.networkType || NetworkType.FRACTAL_BITCOIN_MAINNET;
      const assetType = req.body.assetType || "brc20";
      const isFractal =
        networkType == NetworkType.FRACTAL_BITCOIN_MAINNET ||
        networkType == NetworkType.FRACTAL_BITCOIN_TESTNET;
      const isBrc20 = assetType == "brc20";
      if (isFractal && isBrc20) {
        const ret = await deposit.confirm(req.body);
        void res.send(ret);
      } else {
        need(!!pubkey, paramsMissing("pubkey"));
        need(!!address, paramsMissing("address"));
        need(!!amount, paramsMissing("amount"));
        need(!!tick, paramsMissing("tick"));
        need(!!req.body.assetType, paramsMissing("assetType"));
        need(!!req.body.networkType, paramsMissing("networkType"));
        const params: BridgeConfirmDepositReq = {
          tick,
          amount,
          address,
          pubkey,
          psbt,
          l1AssetType: assetType,
          bridgeType: BridgeType.swap,
        };
        const { txid } = await api.confirmBridgeDeposit(params, networkType);

        const data: DepositData = {
          cursor: PENDING_CURSOR,
          address,
          inscriptionId: null,
          tick: l1ToL2TickName(tick),
          amount,
          height: UNCONFIRM_HEIGHT,
          ts: Math.floor(Date.now() / 1000),
          txid,
          type: "bridge",
        };
        await depositDao.upsertDataByTxid(data);
        const config = await api.bridgeConfig(networkType);
        return { txid, pendingNum: config.depositNeedConfirmations };
      }
    }
  );

  fastify.get(
    `/system_status`,
    schema(
      Joi.object<SystemStatusReq>({}),
      "get",
      Joi.object<SystemStatusRes>({
        committing: Joi.boolean().description(
          "Is rollup inscription committing"
        ),
      }),
      { summary: "Gets the current system state.", apiDoc: true }
    ),
    async (req: Req<SystemStatusReq, "get">, res: Res<SystemStatusRes>) => {
      let committing = true;
      try {
        operator.checkSystemStatus();
        committing = false;
      } catch (err) {}
      void res.send({
        committing,
      });
    }
  );

  fastify.get(
    `/withdraw_history`,
    schema(
      Joi.object<WithdrawHistoryReq>({
        address: Joi.string().required(),
        pubkey: Joi.string(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
        tick: Joi.string(),
      }),
      "get",
      Joi.object<WithdrawHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<ConditionalWithdrawHistoryItem>({
            id: Joi.string(),
            tick: Joi.string(),
            totalAmount: Joi.string().description("Total amount withdrawal"),
            completedAmount: Joi.string().description(
              "The number of withdrawal completed"
            ),
            ts: Joi.number(),
            totalConfirmedNum: Joi.number().description(
              "The current number of confirmations"
            ),
            totalNum: Joi.number().description(
              "The total number of confirmations"
            ),
            status: Joi.string(),
            type: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the user withdrawal history.", apiDoc: true }
    ),
    async (
      req: Req<WithdrawHistoryReq, "get">,
      res: Res<WithdrawHistoryRes>
    ) => {
      const ret = await query.withdrawHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_retry_withdraw`,
    schema(
      Joi.object<CreateRetryWithdrawReq>({
        id: Joi.string().required(),
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
      }),
      "get",
      Joi.object<CreateRetryWithdrawRes>({
        paymentPsbt: Joi.string().description("The user psbt with payment"),
        approvePsbt: Joi.string().description(
          "The user psbt with approve insctiption"
        ),
        networkFee: Joi.number(),
      }),
      {
        summary: "Retry create a withdraw psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<CreateRetryWithdrawReq, "get">,
      res: Res<CreateRetryWithdrawRes>
    ) => {
      const ret = await directWithdraw.createRetry(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/confirm_retry_withdraw`,
    schema(
      Joi.object<ConfirmRetryWithdrawReq>({
        id: Joi.string().required().description("The withdraw order id"),
        paymentPsbt: Joi.string().required(),
        approvePsbt: Joi.string().required(),
      }),
      "post",
      Joi.object<ConfirmRetryWithdrawRes>({}),
      {
        summary: "User signature withdraw psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<ConfirmRetryWithdrawReq, "post">,
      res: Res<ConfirmRetryWithdrawRes>
    ) => {
      const ret = await directWithdraw.confirmRetry(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/create_withdraw`,
    schema(
      Joi.object<CreateDirectWithdrawReq>({
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
        tick: Joi.string().required(),
        amount: Joi.string().required(),
        ts: Joi.number().required(),
        feeTick: Joi.string().required(),
        payType: Joi.string().required(),
        feeRate: Joi.number(),
        assetType: Joi.string(),
        networkType: Joi.string(),
      }),
      "get",
      Joi.object<CreateDirectWithdrawRes>({}),
      {
        summary: "Create a withdraw psbt to be signed by the user.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<CreateDirectWithdrawReq, "get">,
      res: Res<CreateDirectWithdrawRes>
    ) => {
      need(!config.binOpts.includes("withdraw"), cant_opt);

      const { ts, feeTick, payType, amount, address, pubkey, tick } = req.query;
      const networkType =
        req.query.networkType || NetworkType.FRACTAL_BITCOIN_MAINNET;
      const assetType = req.query.assetType || "brc20";
      const isFractal =
        networkType == NetworkType.FRACTAL_BITCOIN_MAINNET ||
        networkType == NetworkType.FRACTAL_BITCOIN_TESTNET;
      const isBrc20 = assetType == "brc20";

      need(payType == PayType.tick);

      if (isFractal && isBrc20) {
        const ret = await directWithdraw.create(req.query);
        void res.send(ret);
      } else {
        need(!!req.query.assetType, paramsMissing("assetType"));
        need(!!req.query.networkType, paramsMissing("networkType"));
        const params: FuncReq = {
          func: FuncType.send,
          req: {
            address,
            tick,
            amount,
            ts,
            feeTick,
            payType,
            to: config.proxyAddress,
          },
        };

        let appendCostUsd: number;
        const btcBridgeConfig = await api.bridgeConfig(
          NetworkType.BITCOIN_MAINNET
        );
        if (!isFractal) {
          let byte: number;
          if (!isBrc20) {
            byte = 265;
          } else {
            byte = 208 + 193 + 263;
          }
          appendCostUsd = parseFloat(
            decimalCal(
              [byte, "mul", btcBridgeConfig.l1FeeRate, "mul", env.BtcSatsPrice],
              "6"
            )
          );
        } else {
          const byte = 265;
          appendCostUsd = parseFloat(
            decimalCal(
              [byte, "mul", btcBridgeConfig.l2FeeRate, "mul", env.FbSatsPrice],
              "6"
            )
          );
        }

        const bridgeConfig = await api.bridgeConfig(networkType);
        need(
          parseFloat(amount) >= bridgeConfig.withdrawLimit[tick],
          withdraw_too_low
        );

        const res0 = await operator.genPreRes(params, appendCostUsd, true);
        const ret: CreateDirectWithdrawRes = {
          id: res0.ids[0],
          paymentPsbt: null,
          approvePsbt: null,
          approvePsbtSignIndexes: null,
          networkFee: null,
          assetType,
          networkType,
          originTick: l2ToL1TickName(tick),
          ...res0,
        };
        void res.send(ret);
      }
    }
  );

  fastify.post(
    `/confirm_withdraw`,
    schema(
      Joi.object<ConfirmDirectWithdrawReq>({
        id: Joi.string().required().description("The withdraw order id"),
        paymentPsbt: Joi.string().required(),
        approvePsbt: Joi.string().required(),
        feeTick: Joi.string().required(),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string().required(),
        rememberPayType: Joi.boolean(),

        ts: Joi.number(),
        pubkey: Joi.string(),
        address: Joi.string(),
        amount: Joi.string(),
        tick: Joi.string(),
        assetType: Joi.string(),
        networkType: Joi.string(),
      }),
      "post",
      Joi.object<ConfirmWithdrawRes>({}),
      {
        summary: "User signature withdraw psbt, submit confirmation.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<ConfirmDirectWithdrawReq, "post">,
      res: Res<ConfirmWithdrawRes>
    ) => {
      const {
        id,
        ts,
        feeAmount,
        feeTick,
        feeTickPrice,
        sigs,
        payType,
        amount,
        address,
        pubkey,
        tick,
      } = req.body;

      const networkType =
        req.body.networkType || NetworkType.FRACTAL_BITCOIN_MAINNET;
      const assetType = req.body.assetType || "brc20";
      const isFractal =
        networkType == NetworkType.FRACTAL_BITCOIN_MAINNET ||
        networkType == NetworkType.FRACTAL_BITCOIN_TESTNET;
      const isBrc20 = assetType == "brc20";
      if (isFractal && isBrc20) {
        // need(!config.binOpts.includes("withdraw"), cant_opt);
        const ret = await directWithdraw.confirm(req.body);
        void res.send(ret);
      } else {
        need(!!ts, paramsMissing("ts"));
        need(!!pubkey, paramsMissing("pubkey"));
        need(!!address, paramsMissing("address"));
        need(!!amount, paramsMissing("amount"));
        need(!!tick, paramsMissing("tick"));
        need(!!req.body.assetType, paramsMissing("assetType"));
        need(!!req.body.networkType, paramsMissing("networkType"));

        const params1: FuncReq = {
          func: FuncType.send,
          req: {
            address,
            tick,
            to: config.proxyAddress,
            amount,
            ts,
            feeTick,
            feeAmount,
            feeTickPrice,
            sigs,
            payType,
          },
        };
        await operator.aggregate(params1, false, true);

        const params2: BridgeConfirmWithdrawReq = {
          funcId: id,
          tick,
          amount,
          address,
          pubkey,
          l1AssetType: assetType,
          bridgeType: BridgeType.swap,
        };
        const res0 = await api.confirmBridgeWithdraw(params2, networkType);
        const item: Partial<WithdrawData> = {
          id: id,
          type: "bridge",
          pubkey,
          address,
          tick,
          amount,
          ts,
        };
        await withdrawDao.upsertData(item as any);
        void res.send({});
      }
    }
  );

  // fastify.get(
  //   `/create_cancel_withdraw`,
  //   schema(
  //     Joi.object<CreateCancelWithdrawReq>({
  //       id: Joi.string().required(),
  //     }),
  //     "get",
  //     Joi.object<CreateCancelWithdrawRes>({
  //       id: Joi.string(),
  //       psbt: Joi.string(),
  //       networkFee: Joi.number(),
  //     }),
  //     {
  //       summary: "Create a cancel-withdraw psbt to be signed by the user.",
  //       apiDoc: true,
  //     }
  //   ),
  //   async (
  //     req: Req<CreateCancelWithdrawReq, "get">,
  //     res: Res<CreateCancelWithdrawRes>
  //   ) => {
  //     need(!config.binOpts.includes("conditional-approve"), cant_opt);
  //     const ret = await withdraw.createCancel(req.query);
  //     void res.send(ret);
  //   }
  // );

  // fastify.post(
  //   `/confirm_cancel_withdraw`,
  //   schema(
  //     Joi.object<ConfirmCancelWithdrawReq>({
  //       id: Joi.string().required(),
  //       psbt: Joi.string().required(),
  //     }),
  //     "post",
  //     Joi.object<ConfirmCancelWithdrawRes>({}),
  //     {
  //       summary: "User signature cancel-withdraw psbt, submit confirmation.",
  //       apiDoc: true,
  //     }
  //   ),
  //   async (
  //     req: Req<ConfirmCancelWithdrawReq, "post">,
  //     res: Res<ConfirmCancelWithdrawRes>
  //   ) => {
  //     need(!config.binOpts.includes("conditional-approve"), cant_opt);
  //     const ret = await withdraw.confirmCancel(req.body);
  //     void res.send(ret);
  //   }
  // );

  fastify.get(
    `/withdraw_process`,
    schema(
      Joi.object<WithdrawProcessReq>({
        id: Joi.string().required(),
      }),
      "get",
      Joi.object<WithdrawProcessRes>({
        id: Joi.string(),
        tick: Joi.string(),
        amount: Joi.string(),
        ts: Joi.number(),
        status: Joi.string(),

        totalConfirmedNum: Joi.number(),
        totalNum: Joi.number().description(
          "Total number of confirmations (rollUp + approve)"
        ),
        rollUpConfirmNum: Joi.number(),
        rollUpTotalNum: Joi.number().description(
          "Total number of rollUp confirmations"
        ),
        approveConfirmNum: Joi.number(),
        approveTotalNum: Joi.number().description(
          "Total number of approve confirmations"
        ),
        cancelConfirmedNum: Joi.number(),
        cancelTotalNum: Joi.number(),

        rollUpTxid: Joi.string().description(
          "Decrease operation is required to withdraw, which in rollup inscription"
        ),
        paymentTxid: Joi.string(),
        inscribeTxid: Joi.string(),
        approveTxid: Joi.string(),

        completedAmount: Joi.string(),
        matchHistory: Joi.array().items(
          Joi.object<MatchingData>({
            approveInscriptionId: Joi.string().description(
              "Withdraw inscription"
            ),
            transferInscriptionId: Joi.string().description(
              "Deposit inscription"
            ),
            tick: Joi.string(),
            consumeAmount: Joi.string(),
            remainAmount: Joi.string().description("Residual cash withdrawal"),
            approveAddress: Joi.string().description("Withdraw user address"),
            transferAddress: Joi.string().description("Deposit user address"),
            txid: Joi.string().description("Matching txid"),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary: "Gets the withdrawal progress for the specified ID.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<WithdrawProcessReq, "get">,
      res: Res<WithdrawProcessRes>
    ) => {
      const { id } = req.query;
      const item = await withdrawDao.findOne({ id });
      need(!!item, "id not found");
      if (item.type == "bridge") {
        const networkType = getL1NetworkType(item.tick);
        const ret = await api.bridgeTxStatus(
          { txid: id, type: "withdraw" },
          networkType
        );
        void res.send(ret as any);
      } else {
        const ret = await query.withdrawProcess(req.query);
        void res.send(ret);
      }
    }
  );

  fastify.get(
    `/stake_history`,
    schema(
      Joi.object<StakeHistoryReq>({
        pid: Joi.string(),
        search: Joi.string(),
        address: Joi.string().required(),
        type: Joi.string().required(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<StakeHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object({
            pid: Joi.string(),
            address: Joi.string(),
            poolTick0: Joi.string(),
            poolTick1: Joi.string(),
            type: Joi.string(),
            amount: Joi.string(),
            tick: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary: "Gets the stake history.",
        apiDoc: true,
      }
    ),
    async (req: Req<StakeHistoryReq, "get">, res: Res<StakeHistoryRes>) => {
      const ret = await stake.getHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/stake_list`,
    schema(
      Joi.object<StakeListReq>({}),
      "get",
      Joi.object<StakeListRes>({
        list: Joi.array().items(
          Joi.object({
            startBlock: Joi.number(),
            endBlock: Joi.number(),
            stakePools: Joi.array().items(
              Joi.object({
                summary: Joi.object({
                  pid: Joi.string(),
                  poolTick0: Joi.string(),
                  poolTick1: Joi.string(),
                  rewardTick: Joi.string(),
                  curTotalLp: Joi.string(),
                  baseReward: Joi.string(),
                  stageNeedLp: Joi.array().items(Joi.string()),
                  stageAddedRewards: Joi.array().items(Joi.string()),
                }),
              })
            ),
          })
        ),
      }),
      {
        summary: "Gets the stake list.",
        apiDoc: true,
      }
    ),
    async (req: Req<StakeListReq, "get">, res: Res<StakeListRes>) => {
      const ret = await stake.getList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/stake_item`,
    schema(
      Joi.object<StakeItemReq>({
        eid: Joi.string().required(),
      }),
      "get",
      Joi.object<StakeItemRes>({
        item: Joi.object({
          startBlock: Joi.number(),
          endBlock: Joi.number(),
          stakePools: Joi.array().items(
            Joi.object({
              summary: Joi.object({
                pid: Joi.string(),
                poolTick0: Joi.string(),
                poolTick1: Joi.string(),
                rewardTick: Joi.string(),
                curTotalLp: Joi.string(),
                baseReward: Joi.string(),
                stageNeedLp: Joi.array().items(Joi.string()),
                stageAddedRewards: Joi.array().items(Joi.string()),
              }),
            })
          ),
        }),
      }),
      {
        summary: "Gets the stake item.",
        apiDoc: false,
      }
    ),
    async (req: Req<StakeItemReq, "get">, res: Res<StakeItemRes>) => {
      const item = await stake.getEpochByEid(req.query.eid);
      const ret: StakeItemRes = {
        item,
        newestHeight: global.env.NewestHeight,
      };
      void res.send(ret);
    }
  );

  fastify.get(
    `/stake_user_info`,
    schema(
      Joi.object<StakeUserInfoReq>({
        address: Joi.string(),
      }),
      "get",
      Joi.object<StakeUserInfoRes>({}),
      {
        summary: "Gets the user info.",
        apiDoc: true,
      }
    ),
    async (req: Req<StakeUserInfoReq, "get">, res: Res<StakeUserInfoRes>) => {
      const ret = await stake.getUserInfoMap(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/user_info`,
    schema(
      Joi.object<UserInfoReq>({
        address: Joi.string().required(),
      }),
      "get",
      Joi.object<UserInfoRes>({
        defaultPayType: Joi.string(),
      }),
      {
        summary: "Gets the user info.",
        apiDoc: true,
      }
    ),
    async (req: Req<UserInfoReq, "get">, res: Res<UserInfoRes>) => {
      const ret = await payDao.findOne(
        { address: req.query.address },
        { projection: { _id: 0 } }
      );
      void res.send(ret || { defaultPayType: null, rememberPayType: null });
    }
  );

  fastify.get(
    `/select_deposit`,
    schema(
      Joi.object<SelectDepositReq>({
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
        v: Joi.string(),
      }),
      "get",
      Joi.object<SelectDepositRes>({}),
      {
        summary: "",
        apiDoc: false,
      }
    ),
    async (req: Req<SelectDepositReq, "get">, res: Res<SelectDepositRes>) => {
      const ret = await query.getSelectDeposit(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/func_info`,
    schema(
      Joi.object<FuncInfoReq>({
        id: Joi.string().required(),
      }),
      "get",
      Joi.object<FuncInfoRes>({}),
      {
        summary: "Gets the func info.",
        apiDoc: false,
      }
    ),
    async (req: Req<FuncInfoReq, "get">, res: Res<FuncInfoRes>) => {
      const { id } = req.query;
      const opCommit = await opCommitDao.findOne(
        { "op.data.id": id },
        { projection: { _id: 0 } }
      );
      let ret: FuncInfoRes = null;
      for (let i = 0; i < opCommit.op.data.length; i++) {
        const item = opCommit.op.data[i];
        if (item.id == id) {
          ret = item;
          break;
        }
      }
      void res.send(ret);
    }
  );

  fastify.get(
    `/deposit_balance`,
    schema(
      Joi.object<DepositBalanceReq>({
        pubkey: Joi.string().required(),
        address: Joi.string().required(),
        tick: Joi.string().required(),
      }),
      "get",
      Joi.object<DepositBalanceRes>({}),
      {
        summary: "",
        apiDoc: false,
      }
    ),
    async (req: Req<DepositBalanceReq, "get">, res: Res<DepositBalanceRes>) => {
      //
      const { tick } = req.query;
      const data = await query.getSelectDeposit({
        ...req.query,
        v: "2",
      });

      let ret: SwapAssetItem = {
        tick: tick,
        brc20Tick: "",
        assetType: "brc20",
        networkType: NetworkType.FRACTAL_BITCOIN_MAINNET,
        swapBalance: {
          module: "0",
          swap: "0",
          pendingSwap: "0",
          pendingAvailable: "0",
        },
        externalBalance: {
          balance: "0",
          unavailableBalance: "0",
          divisibility: "0",
          brc20: {
            available: "0",
            transferable: "0",
          },
        },
      };
      let list: SwapAssetItem[] = [];
      list = list
        .concat(data.bitcoin.brc20)
        .concat(data.bitcoin.native)
        .concat(data.bitcoin.runes)
        .concat(data.bitcoin.alkanes)
        .concat(data.fractal.brc20)
        .concat(data.fractal.native)
        .concat(data.fractal.runes);
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.tick == tick) {
          ret = item;
          break;
        }
      }
      void res.send(ret);
    }
  );

  fastify.get(
    `/deposit_process`,
    schema(
      Joi.object<DepositProcessReq>({
        txid: Joi.string().required(),
      }),
      "get",
      Joi.object<DepositProcessRes>({
        tick: Joi.string(),
        amount: Joi.string(),
        cur: Joi.number().description("Current number of confirmations"),
        sum: Joi.number().description("Total number of confirmations"),
        ts: Joi.number(),
        txid: Joi.string(),
        type: Joi.string(),
        status: Joi.string(),
      }),
      { summary: "Gets the deposit process.", apiDoc: true }
    ),
    async (req: Req<DepositProcessReq, "get">, res: Res<DepositProcessRes>) => {
      const ret = await query.depositHistoryItem(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/tick_price`,
    schema(
      Joi.object<TickPriceReq>({
        tick: Joi.string().required(),
      }),
      "get",
      Joi.object<TickPriceRes>({
        price: Joi.number(),
      }),
      { summary: "Gets the tick price", apiDoc: true }
    ),
    async (req: Req<TickPriceReq, "get">, res: Res<TickPriceRes>) => {
      const price = await query.getTickPrice(req.query.tick);
      void res.send({ price });
    }
  );

  fastify.get(
    `/address_gas`,
    schema(
      Joi.object<AddressGasReq>({
        address: Joi.string().required(),
        feeTick: Joi.string().required(),
      }),
      "get",
      Joi.object<AddressGasRes>({
        total: Joi.number(),
      }),
      { summary: "Gets the address's total tick fee", apiDoc: true }
    ),
    async (req: Req<AddressGasReq, "get">, res: Res<AddressGasRes>) => {
      const ret = await query.getAddressGas(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/price_line`,
    schema(
      Joi.object<PriceLineReq>({
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        timeRange: Joi.string().required(),
      }),
      "get",
      Joi.object<PriceLineRes>({
        list: Joi.array().items(
          Joi.object({
            price: Joi.number(),
            usdPrice: Joi.number(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the price line.", apiDoc: true }
    ),
    async (req: Req<PriceLineReq, "get">, res: Res<PriceLineRes>) => {
      const ret = await query.priceLine(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/community_info`,
    schema(
      Joi.object<CommunityInfoReq>({
        tick: Joi.string().required(),
      }),
      "get",
      Joi.object<CommunityInfoRes>({
        tick: Joi.string(),
        twitter: Joi.string(),
        telegram: Joi.string(),
        website: Joi.string(),
        discord: Joi.string(),
        desc: Joi.string(),
      }),
      { summary: "Gets the community info.", apiDoc: true }
    ),
    async (req: Req<CommunityInfoReq, "get">, res: Res<CommunityInfoRes>) => {
      const ret = await query.communityInfo(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/add_community_info`,
    schema(
      Joi.object<AddCommunityInfoReq>({
        tick: Joi.string().required(),
        twitter: Joi.string().allow(""),
        telegram: Joi.string().allow(""),
        website: Joi.string().allow(""),
        discord: Joi.string().allow(""),
        desc: Joi.string().allow(""),
      }),
      "post",
      Joi.object<AddCommunityInfoRes>({}),
      { summary: "Adds community info.", apiDoc: true }
    ),
    async (
      req: Req<AddCommunityInfoReq, "post">,
      res: Res<AddCommunityInfoRes>
    ) => {
      const item: CommunityData = {
        tick: req.body.tick,
        twitter: req.body.twitter,
        telegram: req.body.telegram,
        website: req.body.website,
        discord: req.body.discord,
        desc: req.body.desc,
      };

      await communityDao.upsertOne({ tick: item.tick }, { $set: item });
      void res.send({});
    }
  );

  fastify.get(
    `/community_list`,
    schema(
      Joi.object<CommunityListReq>({}),
      "get",
      Joi.object<CommunityListRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object({
            tick: Joi.string(),
            twitter: Joi.string(),
            telegram: Joi.string(),
            website: Joi.string(),
            discord: Joi.string(),
            desc: Joi.string(),
          })
        ),
      }),
      { summary: "Gets the community info list.", apiDoc: true }
    ),
    async (req: Req<CommunityListReq, "get">, res: Res<CommunityListRes>) => {
      const ret = await query.communityList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/tick_holders`,
    schema(
      Joi.object<TickHoldersReq>({
        tick: Joi.string().required(),
        start: Joi.number().required(),
        limit: Joi.number().required().max(100),
      }),
      "get",
      Joi.object<TickHoldersRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object({
            address: Joi.string(),
            amount: Joi.string(),
            percentage: Joi.number(),
            relativePercentage: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the tick holders.", apiDoc: true }
    ),
    async (req: Req<TickHoldersReq, "get">, res: Res<TickHoldersRes>) => {
      const ret = await query.tickHolders(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pool_holders`,
    schema(
      Joi.object<PoolHoldersReq>({
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get",
      Joi.object<PoolHoldersRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object({
            address: Joi.string(),
            amount0: Joi.string(),
            amount1: Joi.string(),
            lp: Joi.string(),
            shareOfPool: Joi.string(),
            lockLp: Joi.object<LockLpItem>({
              lp: Joi.string(),
              amount0: Joi.string(),
              amount1: Joi.string(),
            }),
          })
        ),
      }),
      { summary: "Gets the pool holders.", apiDoc: true }
    ),
    async (req: Req<PoolHoldersReq, "get">, res: Res<PoolHoldersRes>) => {
      const ret = await query.poolHolders(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/pre_batch_send`,
    schema(
      Joi.object<BatchSendReq>({
        address: Joi.string().required(),
        tick: Joi.string().required().description("Send tick"),
        amount: Joi.string().description("The amount of send tick"),
        amountList: Joi.array()
          .items(Joi.string())
          .description("The amount of send tick"),
        to: Joi.array()
          .items(Joi.string())
          .required()
          .description("The receiver of send tick")
          .max(100)
          .min(1),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
        checkBalance: Joi.boolean().default(true),
      }),
      "post",
      Joi.object<PreRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/batch_send interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<BatchSendReq, "post">, res: Res<PreRes>) => {
      //
      const params = {
        func: FuncType.send,
        req: req.body,
      } as BatchFuncReq;

      const {
        tick,
        address,
        to,
        amount,
        feeTick,
        payType,
        checkBalance,
        amountList,
      } = req.body;
      let transferAmount = "0";
      if (amountList) {
        transferAmount = decimalCal([
          amountList.reduce((a, b) => decimalCal([a, "add", b])),
        ]);
        need(amountList.length == to.length, params_error);
      } else {
        transferAmount = decimalCal([amount, "mul", to.length]);
      }
      need(!!amount || !!amountList, params_error);
      const balance = operator.PendingSpace.getTickBalance(address, tick);

      try {
        const ret = await operator.genBatchPreRes(params);

        if (!ret.hasVoucher && checkBalance) {
          if (feeTick == tick) {
            if (payType == "freeQuota") {
              need(
                parseFloat(balance.swap) >= parseFloat(transferAmount),
                insufficient_balance
              );
            } else {
              need(
                parseFloat(balance.swap) >=
                  parseFloat(transferAmount) + parseFloat(ret.feeAmount),
                insufficient_balance
              );
            }
          } else {
            need(
              parseFloat(balance.swap) >= parseFloat(transferAmount),
              insufficient_balance
            );

            if (payType == "freeQuota") {
              //
            } else {
              const feeBalance = operator.PendingSpace.getTickBalance(
                address,
                feeTick
              );
              need(
                parseFloat(feeBalance.swap) >= parseFloat(ret.feeAmount),
                insufficient_balance
              );
            }
          }
        }

        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.post(
    `/batch_send`,
    schema(
      Joi.object<BatchSendReq>({
        address: Joi.string().required(),
        tick: Joi.string().required().description("Send tick"),
        amount: Joi.string().description("The amount of send tick"),
        amountList: Joi.array()
          .items(Joi.string())
          .description("The amount of send tick"),
        to: Joi.array()
          .items(Joi.string())
          .required()
          .description("The receiver of send tick")
          .max(100)
          .min(1),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<BatchSendRes>({}),
      { summary: "The send operation.", apiDoc: true }
    ),
    async (req: Req<BatchSendReq, "post">, res: Res<BatchSendRes>) => {
      const { amount, amountList } = req.body;
      need(!!amount || !!amountList, params_error);
      if (amountList) {
        need(amountList.length == req.body.to.length, params_error);
      }

      checkAddressType(req.body.address);
      for (let i = 0; i < req.body.to.length; i++) {
        checkAddressType(req.body.to[i]);
      }
      need(!isLp(req.body.tick), cant_opt);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      //
      const ret = await operator.batchAggregate2({
        func: FuncType.send,
        req: req.body,
      });
      void res.send(ret);
    }
  );

  fastify.get(
    `/reward_curve`,
    schema(
      Joi.object<RewardCurveReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        startTime: Joi.number().required(),
        endTime: Joi.number().required(),
      }),
      "get",
      Joi.object<RewardCurveRes>({}),
      { summary: "Get reward curve data.", apiDoc: true }
    ),
    async (req: Req<RewardCurveReq, "get">, res: Res<RewardCurveRes>) => {
      const ret = await query.rewardCurve(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/send_lp_history`,
    schema(
      Joi.object<SendLpHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        fuzzySearch: Joi.boolean(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<SendLpHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<SendLpHistoryItem>({
            tick: Joi.string(),
            amount: Joi.string(),
            to: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of send lp transaction.", apiDoc: true }
    ),
    async (req: Req<SendLpHistoryReq, "get">, res: Res<SendLpHistoryRes>) => {
      const ret = await query.sendLpHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/burn_history`,
    schema(
      Joi.object<BurnHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        fuzzySearch: Joi.boolean(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
        ts: Joi.number(),
      }),
      "get",
      Joi.object<BurnHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<BurnHistoryItem>({
            tick: Joi.string(),
            amount: Joi.string(),
            to: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of burn transaction.", apiDoc: true }
    ),
    async (req: Req<BurnHistoryReq, "get">, res: Res<BurnHistoryRes>) => {
      const ret = await query.burnHistory(req.query);
      void res.send(ret);
    }
  );

  // Task List Interface
  fastify.get(
    `/task_list`,
    schema(
      Joi.object<TaskListReq>({
        tid: Joi.string().default("1"),
        address: Joi.string().required(),
      }),
      "get",
      Joi.object<TaskListRes>({
        tid: Joi.string(),
        list: Joi.array().items(
          Joi.object({
            tid: Joi.string(),
            itemId: Joi.string(),
            address: Joi.string(),
            done: Joi.boolean(),
          })
        ),
      }),
      { summary: "Get task list for address.", apiDoc: true }
    ),
    async (req: Req<TaskListReq, "get">, res: Res<TaskListRes>) => {
      const ret = await query.taskList(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/address_usd`,
    schema(
      Joi.object<AssetsUSDReq>({
        address: Joi.string().required(),
      }),
      "get",
      Joi.array<AssetsUSDRes>().items(
        Joi.object({
          assetsUSD: Joi.string(),
          lpUSD: Joi.string(),
        })
      ),
      { summary: "Get address usd.", apiDoc: true }
    ),
    async (req: Req<AssetsUSDReq, "get">, res: Res<AssetsUSDRes>) => {
      const ret = await query.getAddressUSD(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_lock_lp`,
    schema(
      Joi.object<LockLpReq>({
        address: Joi.string().required(),
        lockDay: Joi.string().required(),
        tick0: Joi.string().required().description("Lp tick0"),
        tick1: Joi.string().required().description("Lp tick1"),
        amount: Joi.string().required().description("The amount of lock tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreLockLpRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/lock_lp interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<LockLpReq, "get">, res: Res<PreLockLpRes>) => {
      const { address, lockDay, amount, tick0, tick1, feeTick, ts, payType } =
        req.query;
      checkLockDay(lockDay);
      const params = {
        func: FuncType.lock,
        req: {
          address,
          tick0,
          tick1,
          amount,
          feeTick,
          ts,
          payType,
        },
      } as FuncReq;
      try {
        const ret = (await operator.genPreRes(params)) as PreLockLpRes;
        const info = await operator.quoteRemoveLiq({
          address: "",
          tick0,
          tick1,
          lp: "1",
        });
        ret.amount0PerLp = info.amount0;
        ret.amount1PerLp = info.amount1;
        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.post(
    `/lock_lp`,
    schema(
      Joi.object<LockLpReq>({
        address: Joi.string().required(),
        lockDay: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount: Joi.string().required().description("The amount of lock tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<LockLpRes>({}),
      { summary: "The lock lp operation.", apiDoc: true }
    ),
    async (req: Req<LockLpReq, "post">, res: Res<LockLpRes>) => {
      checkAddressType(req.body.address);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      const ret = await lockLp.lock(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_unlock_lp`,
    schema(
      Joi.object<UnLockLpReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required().description("Lp tick0"),
        tick1: Joi.string().required().description("Lp tick1"),
        amount: Joi.string()
          .required()
          .description("The amount of unlock tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.object<PreUnlockLpRes>({
        ids: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature id"),
        signMsgs: Joi.array()
          .items(Joi.string())
          .required()
          .description("User signature information"),
        feeAmount: Joi.string().description(
          "The fee that the user needs to pay"
        ),
        feeTickPrice: Joi.string().description("The price of fee tick"),
        feeBalance: Joi.string().description("The user's fee tick balance"),
        usdPrice: Joi.string().description("The dollar value of the fee"),
      }),
      {
        summary:
          "/unlock_lp interface pre-load, get the signature content, gas and byte information.",
        apiDoc: true,
      }
    ),
    async (req: Req<UnLockLpReq, "get">, res: Res<PreUnlockLpRes>) => {
      const { address, amount, tick0, tick1, feeTick, ts, payType } = req.query;
      const pair = getPairStrV2(tick0, tick1);
      const userLockLp = await lockLp.getUserLockLp(pair, address);
      const { availableUnlockLp } = userLockLp;
      need(bnGte(availableUnlockLp, amount), invalid_amount);
      const params = {
        func: FuncType.unlock,
        req: {
          address,
          tick0,
          tick1,
          amount,
          feeTick,
          ts,
          payType,
        },
      } as FuncReq;
      try {
        const ret = (await operator.genPreRes(params)) as PreUnlockLpRes;
        const info = await operator.quoteRemoveLiq({
          address: "",
          tick0,
          tick1,
          lp: "1",
        });
        ret.amount0PerLp = info.amount0;
        ret.amount1PerLp = info.amount1;
        void res.send(ret);
      } catch (err) {
        if (err.message == invalid_amount) {
          throw new Error(insufficient_balance);
        } else {
          throw err;
        }
      }
    }
  );

  fastify.post(
    `/unlock_lp`,
    schema(
      Joi.object<UnLockLpReq>({
        address: Joi.string().required(),
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        amount: Joi.string()
          .required()
          .description("The amount of unlock tick"),
        ts: Joi.number().required().description("Timestamp (seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        feeAmount: Joi.string()
          .required()
          .description("The fee that the user needs to pay"),
        feeTickPrice: Joi.string()
          .required()
          .description("The price of fee tick"),
        sigs: Joi.array()
          .items(Joi.string().required())
          .description("User signature"),
        payType: Joi.string(),
        rememberPayType: Joi.boolean(),
      }),
      "post",
      Joi.object<LockLpRes>({}),
      { summary: "The unlock lp operation.", apiDoc: true }
    ),
    async (req: Req<UnLockLpReq, "post">, res: Res<UnLockLpRes>) => {
      checkAddressType(req.body.address);
      need(
        ![env.ModuleInitParams.gas_to, env.ModuleInitParams.fee_to].includes(
          req.body.address
        ),
        params_error
      );
      const ret = await lockLp.unlock(req.body);
      void res.send(ret);
    }
  );

  fastify.get(
    `/lock_lp_history`,
    schema(
      Joi.object<LockLpHistoryReq>({
        tick: Joi.string().optional(),
        tick0: Joi.string().optional(),
        tick1: Joi.string().optional(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
        address: Joi.string().optional(),
        lockDay: Joi.number().optional(),
      }),
      "get",
      Joi.object<LockLpHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<RecordLockLpItem>({
            id: Joi.string(),
            address: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            lp: Joi.string(),
            amount0: Joi.string(),
            amount1: Joi.string(),
            amount0USD: Joi.string(),
            amount1USD: Joi.string(),
            lockDay: Joi.number(),
            unlockTime: Joi.string(),
            ts: Joi.number(),
            shareOfPool: Joi.string(),
          })
        ),
      }),
      {
        summary: "Gets the history of lock lp transaction.",
        apiDoc: true,
      }
    ),
    async (req: Req<LockLpHistoryReq, "get">, res: Res<LockLpHistoryRes>) => {
      const ret = await lockLp.getLockHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/unlock_lp_history`,
    schema(
      Joi.object<UnlockLpHistoryReq>({
        tick: Joi.string().optional(),
        tick0: Joi.string().optional(),
        tick1: Joi.string().optional(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
        address: Joi.string().optional(),
      }),
      "get",
      Joi.object<UnlockLpHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<RecordUnlockLpData>({
            id: Joi.string(),
            address: Joi.string(),
            tick0: Joi.string(),
            tick1: Joi.string(),
            lp: Joi.string(),
            amount0: Joi.string(),
            amount1: Joi.string(),
            amount0USD: Joi.string(),
            amount1USD: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      {
        summary: "Gets the history of unlock lp transaction.",
        apiDoc: true,
      }
    ),
    async (
      req: Req<UnlockLpHistoryReq, "get">,
      res: Res<UnlockLpHistoryRes>
    ) => {
      const ret = await lockLp.getUnlockHistory(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/export_lock_lp_history`,
    schema(
      Joi.object<ExportLockLpHistoryReq>({
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        lockDay: Joi.number().optional(),
        lockTime: Joi.number().optional(),
      }),
      "get",
      undefined,
      {
        summary: "Export lock lp history to CSV file.",
        apiDoc: true,
      }
    ),
    async (req: Req<ExportLockLpHistoryReq, "get">, res) => {
      const ret = await lockLp.exportLockLpHistory(req.query);
      void res.header("Content-Type", "text/csv; charset=utf-8");
      void res.header(
        "Content-Disposition",
        `attachment; filename="${ret.fileName}"`
      );
      void res.header("Access-Control-Expose-Headers", "content-disposition");
      void res.send(ret.csvContent);
    }
  );

  fastify.get(
    `/my_lock_lp`,
    schema(
      Joi.object<UserLockLpInfoReq>({
        tick0: Joi.string().required(),
        tick1: Joi.string().required(),
        address: Joi.string().required(),
      }),
      "get",
      Joi.object<UserLockLpInfoRes>({
        lp: Joi.string(),
        lockLp: Joi.string(),
        availableLp: Joi.string(),
        availableAmount0: Joi.string(),
        availableAmount1: Joi.string(),
        shareOfPool: Joi.string(),
      }),
      {
        summary: "Gets the user lock lp.",
        apiDoc: true,
      }
    ),
    async (req: Req<UserLockLpInfoReq, "get">, res: Res<UserLockLpInfoRes>) => {
      const ret = await lockLp.myLockLp(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/select_pool`,
    schema(
      Joi.object<SelectPoolReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().optional(),
        tickOut: Joi.string().optional(),
        search: Joi.string().optional(),
      }),
      "get",
      Joi.array<SelectPoolRes>().items(
        Joi.object({
          tick: Joi.string(),
          decimal: Joi.string(),
          brc20Balance: Joi.string().description(
            "Module balance (not participate in swap calculations)"
          ),
          swapBalance: Joi.string().description("Swap balance"),
        })
      ),
      {
        summary: "Select the tick information that you can swap.",
        apiDoc: true,
      }
    ),
    async (req: Req<SelectPoolReq, "get">, res: Res<SelectPoolRes>) => {
      let ret = await query.getSelectPool(req.query);
      void res.send(ret);
    }
  );

  fastify.get(
    `/pre_multi_swap`,
    schema(
      Joi.object<SwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amountIn: Joi.string()
          .required()
          .description("The amount of input tick"),
        amountOut: Joi.string()
          .required()
          .description("The amount of output tick"),
        slippage: Joi.string().required(),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required()
          .example(ExactType.exactIn),
        ts: Joi.number().required().description("Timestamp(seconds)"),
        feeTick: Joi.string().required().description("Tick used as fee"),
        payType: Joi.string().description("Pay Type: tick, freeQuota"),
      }),
      "get",
      Joi.array().items(
        Joi.object<PreRes>({
          ids: Joi.array()
            .items(Joi.string())
            .required()
            .description("User signature id"),
          signMsgs: Joi.array()
            .items(Joi.string())
            .required()
            .description("User signature information"),
          feeAmount: Joi.string().description(
            "The fee that the user needs to pay"
          ),
          feeTickPrice: Joi.string().description("The price of fee tick"),
          feeBalance: Joi.string().description("The user's fee tick balance"),
          usdPrice: Joi.string().description("The dollar value of the fee"),
        })
      ),
      {
        summary:
          "/multi_swap interface pre-load, get the signature content and gas information.",
        apiDoc: true,
      }
    ),
    async (req: Req<SwapReq, "get">, res: Res<PreRes[]>) => {
      const ret = await operator.multiGenPreRes(req.query);
      void res.send(ret);
    }
  );

  fastify.post(
    `/multi_swap`,
    schema(
      Joi.object<MultiSwapReq>({
        items: Joi.array().items(
          Joi.object<SwapReq>({
            address: Joi.string().required(),
            tickIn: Joi.string().required().description("Input tick"),
            tickOut: Joi.string().required().description("Output tick"),
            amountIn: Joi.string()
              .required()
              .description("The amount of input tick"),
            amountOut: Joi.string()
              .required()
              .description("The amount of output tick"),
            feeTick: Joi.string().required(),
            slippage: Joi.string().required(),
            exactType: Joi.string()
              .valid(...Object.values(ExactType))
              .required(),
            ts: Joi.number().required().description("Timestamp (seconds)"),
            feeAmount: Joi.string()
              .required()
              .description("The fee that the user needs to pay"),
            feeTickPrice: Joi.string()
              .required()
              .description("The price of fee tick"),
            sigs: Joi.array()
              .items(Joi.string().required())
              .description("User signature"),
            payType: Joi.string(),
            rememberPayType: Joi.boolean(),
            assetFeeTick: Joi.string(),
            assetFeeAmount: Joi.string(),
            assetFeeTickPrice: Joi.string(),
          })
        ),
      }),
      "post",
      Joi.array().items(
        Joi.object<MultiSwapRes>({
          address: Joi.string(),
          tickIn: Joi.string(),
          tickOut: Joi.string(),
          success: Joi.boolean(),
          amountIn: Joi.string().optional(),
          amountOut: Joi.string().optional(),
          exactType: Joi.string().optional(),
          value: Joi.number().optional(),
          ts: Joi.number().optional(),
        })
      ),
      { summary: "The multi swap operation.", apiDoc: true }
    ),
    async (req: Req<MultiSwapReq, "post">, res: Res<MultiSwapRes[]>) => {
      need(!config.binOpts.includes("swap"), cant_opt);
      const items = req.body.items;
      need(items.length == 2, invalid_multi_swap_params);
      need(items[0].address == items[1].address, invalid_multi_swap_params);
      need(
        multiRoutes.matchMultiRoute(items[0].tickIn, items[1].tickOut),
        invalid_multi_swap_params
      );
      const rets: MultiSwapRes[] = [];
      const routes: MultiSwapHistoryItem[] = [];
      let swapValue = 0;
      for (const item of items) {
        const { address, tickIn, tickOut } = item;
        checkAddressType(address);
        try {
          const ret = (await operator.aggregate({
            func: FuncType.swap,
            req: item,
          })) as SwapRes;
          const { id, success, amountIn, amountOut, exactType, value, ts } =
            ret;
          rets.push({
            address,
            tickIn,
            tickOut,
            success,
            amountIn,
            amountOut,
            exactType,
            value,
            ts,
          });
          routes.push({
            id,
            tickIn,
            tickOut,
            amountIn,
            amountOut,
            exactType,
            ts,
            success,
          });
          swapValue = value;
        } catch (err) {
          rets.push({
            address,
            tickIn,
            tickOut,
            success: false,
            failureReason: err.message,
          });
          routes.push({
            tickIn,
            tickOut,
            amountIn: item.amountIn,
            amountOut: item.amountOut,
            exactType: item.exactType,
            ts: item.ts,
            success: false,
            failureReason: err.message,
          });
        }
      }
      const recordMultiSwapData = {
        address: items[0].address,
        tickIn: items[0].tickIn,
        tickOut: items[1].tickOut,
        amountIn: items[0].amountIn,
        amountOut: items[1].amountOut,
        exactType: items[0].exactType,
        ts: Math.floor(Date.now() / 1000),
        value: swapValue,
        route0: routes[0],
        route1: routes[1],
      };
      const id = sha256(JSON.stringify(recordMultiSwapData));
      await recordMultiSwapDao.upsertData({
        id,
        ...recordMultiSwapData,
      });
      void res.send(rets);
    }
  );

  fastify.get(
    `/quote_multi_swap`,
    schema(
      Joi.object<QuoteSwapReq>({
        address: Joi.string().required(),
        tickIn: Joi.string().required().description("Input tick"),
        tickOut: Joi.string().required().description("Output tick"),
        amount: Joi.string()
          .required()
          .description(
            "If it is exactIn, it is the amount of input tick, else is the amount of output tick"
          ),
        exactType: Joi.string()
          .valid(...Object.values(ExactType))
          .required()
          .description("Exact input or exact output")
          .example(ExactType.exactIn),
      }),
      "get",
      Joi.object<QuoteMultiSwapRes>({
        amountUSD: Joi.string().description("Input amount of usd value"),
        expectUSD: Joi.string().description("Estimated amount of usd value"),
        expect: Joi.string().description("Estimated amount"),
      }),
      {
        summary:
          "Returns the estimated number of multi swaps based on the input and exact type.",
        apiDoc: false,
      }
    ),
    async (req: Req<QuoteSwapReq, "get">, res: Res<QuoteMultiSwapRes>) => {
      const params = req.query;
      const ret = await operator.quoteSwapNew(params);
      void res.send(ret);
    }
  );

  fastify.get(
    `/multi_swap_history`,
    schema(
      Joi.object<SwapHistoryReq>({
        address: Joi.string(),
        tick: Joi.string(),
        fuzzySearch: Joi.boolean(),
        start: Joi.number().required(),
        limit: Joi.number().less(QUERY_LIMIT).required(),
      }),
      "get",
      Joi.object<MultiSwapHistoryRes>({
        total: Joi.number(),
        list: Joi.array().items(
          Joi.object<MultiSwapHistoryResItem>({
            address: Joi.string(),
            tickIn: Joi.string().required().description("Input tick"),
            tickOut: Joi.string().required().description("Output tick"),
            amountIn: Joi.string()
              .required()
              .description("The amount of input tick"),
            amountOut: Joi.string()
              .required()
              .description("The amount of output tick"),
            exactType: Joi.string(),
            ts: Joi.number(),
          })
        ),
      }),
      { summary: "Gets the history of multi swap.", apiDoc: true }
    ),
    async (req: Req<SwapHistoryReq, "get">, res: Res<MultiSwapHistoryRes>) => {
      const ret = await query.multiSwapHistory(req.query);
      void res.send(ret);
    }
  );

  done();
}
