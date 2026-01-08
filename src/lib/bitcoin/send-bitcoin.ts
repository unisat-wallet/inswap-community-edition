import { DUST294, DUST546 } from "../../domain/constant";
import { CodeEnum, insufficient_btc } from "../../domain/error";
import { need } from "../../domain/utils";
import { VPsbt } from "../../domain/vpsbt";
import { ToSignInput, UTXO } from "../../types/api";
import { ignoreVerifySig } from "./utils";
import { Wallet } from "./wallet";

const TAG = "send-bitcoin";

export function generateSendBTCTx({
  wallet,
  utxos,
  toAddress,
  toAmount,
  feeRate,
  dust600,
}: {
  wallet: Wallet;
  utxos: UTXO[];
  toAddress: string;
  toAmount: number;
  feeRate: number;
  dust600: boolean;
}) {
  const vpsbt = new VPsbt();
  let inputAmount = 0;
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    vpsbt.addInput(wallet.toPsbtInput(utxo));
    inputAmount += utxo.satoshi;
  }
  vpsbt.addOutput({ address: wallet.address, value: DUST546 }); // o0
  vpsbt.addOutput({ address: toAddress, value: toAmount }); // o1

  if (dust600) {
    vpsbt.addOutput({
      // o2
      address: keyring.accelerateWallet.address,
      value: DUST294,
    });
  }

  const left = vpsbt.getLeftAmount();
  logger.debug({
    tag: TAG,
    msg: "generateSendBTCTx",
    utxos,
    toAddress,
    toAmount,
    feeRate,
    left,
  });
  need(left >= 0, insufficient_btc, CodeEnum.sequencer_insufficient_funds);

  const networkFee = vpsbt.estimateNetworkFee(feeRate);
  let change = inputAmount - networkFee - toAmount;
  if (dust600) {
    change -= DUST294;
  }
  need(
    change >= DUST546,
    insufficient_btc,
    CodeEnum.sequencer_insufficient_funds
  );

  vpsbt.updateOutput(0, { address: wallet.address, value: change });
  const psbt = vpsbt.toPsbt();

  const toSignInputs: ToSignInput[] = [];
  for (let i = 0; i < utxos.length; i++) {
    toSignInputs.push({ index: i, address: wallet.address });
  }

  const psbtHex = psbt.toHex();
  ignoreVerifySig(true);
  const tx = psbt.extractTransaction(true);
  ignoreVerifySig(false);

  const txid = tx.getId();

  return {
    txid,
    psbtHex,
    change,
    toSignInputs,
  };
}
