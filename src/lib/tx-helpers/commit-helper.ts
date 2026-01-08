import { DUST294 } from "../../domain/constant";
import { getModuleIdHex } from "../../domain/utils";
import { UTXO } from "../../types/api";
import { AddressType } from "../../types/domain";
import { CommitOp } from "../../types/op";
import {
  Wallet,
  generateInscribeTx,
  generateSendBTCTx,
  generateSendInscriptionTx,
} from "../bitcoin";

export function generateCommitTxs({
  op,
  btcWallet,
  btcUtxosA,
  btcUtxosB,
  sequencerWallet,
  inscribeWallet,
  seqWallet,
  seqUtxo,
  feeRate,
}: {
  op: CommitOp;
  btcWallet: Wallet;
  btcUtxosA: UTXO[];
  btcUtxosB: UTXO[];
  sequencerWallet: Wallet;
  inscribeWallet: Wallet;
  seqWallet: Wallet;
  seqUtxo: UTXO;
  feeRate: number;
}) {
  // create inscribing order
  const content = JSON.stringify(op);
  const inscriptionValue = 330;
  const dummyUtxo: UTXO = {
    txid: "0000000000000000000000000000000000000000000000000000000000000000",
    vout: 0,
    satoshi: 10000000,
    codeType: btcWallet.addressType,
  };

  const { virtualSize, payAddress } = generateInscribeTx({
    inscribeWallet,
    toAddress: sequencerWallet.address,
    content,
    paymentUtxo: dummyUtxo,
    inscriptionValue,
    dust600: true,
  });
  const fee = Math.ceil(virtualSize * feeRate);
  const payAmount = fee + inscriptionValue + DUST294;

  // pay order
  const sendBTCTxResult = generateSendBTCTx({
    wallet: btcWallet,
    utxos: btcUtxosA,
    toAddress: payAddress,
    toAmount: payAmount,
    feeRate,
    dust600: true,
  });

  const nextBtcUtxoA: UTXO = {
    txid: sendBTCTxResult.txid,
    vout: 0,
    satoshi: sendBTCTxResult.change,
    scriptPk: btcWallet.scriptPk,
    codeType: btcWallet.addressType,
  };

  // inscribe
  const inscribeTxResult = generateInscribeTx({
    inscribeWallet,
    content,
    toAddress: sequencerWallet.address,
    paymentUtxo: {
      txid: sendBTCTxResult.txid,
      vout: 1,
      satoshi: payAmount,
      codeType: AddressType.P2TR,
    },
    inscriptionValue,
    dust600: true,
  });

  // sendInscription
  const inscriptionUtxo: UTXO = {
    txid: inscribeTxResult.txid,
    vout: 0,
    satoshi: inscriptionValue,
    codeType: sequencerWallet.addressType,
    scriptPk: sequencerWallet.scriptPk,
  };

  const sendInscriptionTxResult = generateSendInscriptionTx({
    inscriptionWallet: sequencerWallet,
    inscriptionUtxo,
    seqWallet,
    seqUtxo,
    btcWallet,
    btcUtxos: btcUtxosB,
    to: {
      type: "opreturn",
      opreturnData: [getModuleIdHex()],
    },
    feeRate,
    dust600: true,
  });

  const nextSeqUtxo: UTXO = {
    txid: sendInscriptionTxResult.txid,
    vout: 1,
    satoshi: seqUtxo.satoshi,
    scriptPk: seqWallet.scriptPk,
    codeType: seqWallet.addressType,
  };

  const nextBtcUtxoB: UTXO = {
    txid: sendInscriptionTxResult.txid,
    vout: 2,
    satoshi: sendInscriptionTxResult.change,
    scriptPk: btcWallet.scriptPk,
    codeType: btcWallet.addressType,
  };

  return {
    inscriptionId: inscribeTxResult.inscriptionId,
    tx1: {
      txid: sendBTCTxResult.txid,
      psbtHex: sendBTCTxResult.psbtHex,
      toSignInputs: sendBTCTxResult.toSignInputs,
    },
    tx2: {
      txid: inscribeTxResult.txid,
      psbtHex: inscribeTxResult.psbtHex,
      rawtx: inscribeTxResult.rawtx,
    },
    tx3: {
      txid: sendInscriptionTxResult.txid,
      psbtHex: sendInscriptionTxResult.psbtHex,
      toSignInputs: sendInscriptionTxResult.toSignInputs,
    },
    nextBtcUtxoA,
    nextBtcUtxoB,
    nextSeqUtxo,
  };
}
