import { Psbt } from "bitcoinjs-lib";
import { DepositData } from "../dao/deposit-dao";
import {
  ConfirmDepositReq,
  ConfirmDepositRes,
  CreateDepositReq,
  CreateDepositRes,
  DepositType,
} from "../types/route";
import { PENDING_CURSOR, UNCONFIRM_HEIGHT } from "./constant";
import { indexer_error, insufficient_btc } from "./error";
import {
  checkAccess,
  checkAddressType,
  checkTick,
  filterDustUTXO,
  getDust,
  getInputAmount,
  getMinUTXOs,
  getModuleIdHex,
  need,
  reverseHash,
  utxoToInput,
  validator,
} from "./utils";
import { VPsbt } from "./vpsbt";

export class Deposit {
  async init() {
    //
  }

  async tick() {
    //
  }

  /**
   * Create an PSBT to send a TRANSFER to the module
   */
  async create(req: CreateDepositReq): Promise<CreateDepositRes> {
    const { inscriptionId, address, pubkey } = req;
    await checkAccess(address);
    checkAddressType(address);

    const allUTXOs = filterDustUTXO(await api.addressUTXOs(address));
    need(allUTXOs.length > 0, insufficient_btc);
    const inscription = await api.inscriptionInfo(inscriptionId);
    checkTick(inscription?.brc20?.tick);
    const dust = getDust(address);

    const feeRate = req.feeRate || env.FeeRate;
    const utxos = getMinUTXOs(allUTXOs, 1, 1, feeRate);

    const vpsbt = new VPsbt();
    need(!!inscription.utxo.scriptPk, indexer_error);
    vpsbt.addInput(utxoToInput(inscription.utxo, { pubkey })); //i0
    for (let i = 0; i < utxos.length; i++) {
      vpsbt.addInput(utxoToInput(utxos[i], { pubkey })); // i1
    }

    need(inscription.offset == 0, "inscription offset: " + inscription.offset);
    vpsbt.addOpReturn({ buffers: [getModuleIdHex()], value: 1 }); // o0
    vpsbt.addOutput({ address, value: dust }); // o1

    const networkFee = vpsbt.estimateNetworkFee(feeRate);
    const change =
      inscription.utxo.satoshi + getInputAmount(utxos) - 1 - networkFee;
    need(change >= dust, "available balance not enough");

    vpsbt.updateOutput(1, { address, value: change });

    return {
      psbt: vpsbt.toPsbt().toHex(),
      type: "direct",
      expiredTimestamp: null,
      recommendDeposit: null,
    };
  }

  /**
   * Broadcast the transaction. (Send TRANSFER to the module)
   */
  async confirm(
    req: Partial<ConfirmDepositReq> & { transferIndex?: number },
    type: DepositType = "direct"
  ): Promise<ConfirmDepositRes> {
    const psbt = Psbt.fromHex(req.psbt, { network });
    psbt.validateSignaturesOfAllInputs(validator);
    psbt.finalizeAllInputs();

    const inscriptionTxid = reverseHash(
      psbt.txInputs[req.transferIndex || 0].hash.toString("hex")
    );
    const inscriptionId = `${inscriptionTxid}i0`;
    const inscription = await api.inscriptionInfo(inscriptionId);
    need(
      !!inscription && !!inscription.brc20,
      "the transaction on the chain is pending confirmation, please try again later"
    );

    const tx = psbt.extractTransaction(true);
    await api.broadcast(tx.toHex());

    const txid = tx.getId();
    const data: DepositData = {
      cursor: PENDING_CURSOR,
      address: inscription.address,
      inscriptionId,
      tick: inscription.brc20.tick,
      amount: inscription.brc20.amt,
      height: UNCONFIRM_HEIGHT,
      ts: Math.floor(Date.now() / 1000),
      txid,
      type,
    };
    await depositDao.upsertDataByInscriptionId(data);

    return { txid, pendingNum: config.pendingDepositDirectNum };
  }
}
