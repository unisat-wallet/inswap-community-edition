import { DUST294, DUST546 } from "../../domain/constant";
import { CodeEnum, insufficient_balance } from "../../domain/error";
import { need } from "../../domain/utils";
import { VPsbt } from "../../domain/vpsbt";
import { ToSignInput, UTXO } from "../../types/api";
import { ignoreVerifySig } from "./utils";
import { Wallet } from "./wallet";

export function generateSendInscriptionTx({
  inscriptionWallet,
  inscriptionUtxo,
  seqWallet,
  seqUtxo,
  btcWallet,
  btcUtxos,
  to,
  feeRate,
  disableChange,
  dust600,
}: {
  inscriptionWallet: Wallet;
  inscriptionUtxo: UTXO;
  seqWallet?: Wallet;
  seqUtxo?: UTXO;
  btcWallet: Wallet;
  btcUtxos: UTXO[];
  to: {
    type: "opreturn" | "address";
    opreturnData?: Buffer[];
    address?: string;
    value?: number;
  };
  feeRate: number;
  disableChange?: boolean;
  dust600: boolean;
}) {
  const vpsbt = new VPsbt();
  vpsbt.addInput(inscriptionWallet.toPsbtInput(inscriptionUtxo));

  if (seqUtxo) {
    vpsbt.addInput(seqWallet.toPsbtInput(seqUtxo));
  }

  for (let i = 0; i < btcUtxos.length; i++) {
    const utxo = btcUtxos[i];
    vpsbt.addInput(btcWallet.toPsbtInput(utxo));
  }

  if (to.type === "opreturn") {
    const value = to.value || 1;
    vpsbt.addOpReturn({ buffers: to.opreturnData, value }); // o0
  } else {
    const value = to.value || inscriptionUtxo.satoshi;
    vpsbt.addOutput({
      address: to.address,
      value,
    });
  }

  if (seqUtxo) {
    vpsbt.addOutput({
      address: seqWallet.address,
      value: seqUtxo.satoshi,
    });
  }

  let change = 0;
  if (disableChange !== true) {
    const dummyChanged = DUST546;
    vpsbt.addOutput({ address: btcWallet.address, value: dummyChanged }); // o1
    if (dust600) {
      vpsbt.addOutput({
        address: keyring.accelerateWallet.address,
        value: DUST294,
      });
    }
    const left = vpsbt.getLeftAmount();
    need(
      left >= 0,
      insufficient_balance,
      CodeEnum.sequencer_insufficient_funds
    );

    const networkFee = vpsbt.estimateNetworkFee(feeRate);

    change = left + dummyChanged - networkFee;
    vpsbt.updateOutput(vpsbt.outputs.length - 1 - (dust600 ? 1 : 0), {
      address: btcWallet.address,
      value: change,
    });
    need(
      change >= DUST546,
      insufficient_balance,
      CodeEnum.sequencer_insufficient_funds
    );
  }

  const psbt = vpsbt.toPsbt();

  const toSignInputs: ToSignInput[] = [];
  let inputIndex = 0;

  toSignInputs.push({
    index: inputIndex,
    address: inscriptionWallet.address,
  });
  inputIndex++;

  if (seqUtxo) {
    toSignInputs.push({
      index: inputIndex,
      address: seqWallet.address,
    });
    inputIndex++;
  }
  for (let i = 0; i < btcUtxos.length; i++) {
    toSignInputs.push({
      index: inputIndex,
      address: btcWallet.address,
    });
    inputIndex++;
  }

  ignoreVerifySig(true);
  const tx = psbt.extractTransaction(true);
  ignoreVerifySig(false);

  return {
    txid: tx.getId(),
    psbtHex: psbt.toHex(),
    toSignInputs,
    change,
  };
}
