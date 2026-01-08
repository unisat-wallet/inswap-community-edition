import { UTXO } from "../../types/api";
import { AddressType } from "../../types/domain";
import { DeployOp } from "../../types/op";
import { Wallet, generateInscribeTx, generateSendBTCTx } from "../bitcoin";

export function generateDeployModuleTxs({
  op,
  btcWallet,
  btcUtxos,
  moduleWallet,
  inscribeWallet,
  feeRate,
}: {
  op: DeployOp;
  btcWallet: Wallet;
  btcUtxos: UTXO[];
  moduleWallet: Wallet;
  inscribeWallet: Wallet;
  feeRate: number;
}) {
  // create inscribing order
  const content = JSON.stringify(op, null, 2);
  console.log("inscribe:", content);
  const inscriptionValue = 330;
  const dummyUtxo: UTXO = {
    txid: "0000000000000000000000000000000000000000000000000000000000000000",
    vout: 0,
    satoshi: 10000000,
    codeType: btcWallet.addressType,
  };

  const { virtualSize, payAddress } = generateInscribeTx({
    inscribeWallet,
    toAddress: moduleWallet.address,
    content,
    paymentUtxo: dummyUtxo,
    inscriptionValue,
    dust600: false,
  });
  const fee = Math.ceil(virtualSize * feeRate);
  const payAmount = fee + inscriptionValue;

  // pay order
  const sendBTCTxResult = generateSendBTCTx({
    wallet: btcWallet,
    utxos: btcUtxos,
    toAddress: payAddress,
    toAmount: payAmount,
    feeRate,
    dust600: false,
  });

  const nextBtcUtxo: UTXO = {
    txid: sendBTCTxResult.txid,
    vout: 1,
    satoshi: sendBTCTxResult.change,
    scriptPk: btcWallet.scriptPk,
    codeType: btcWallet.addressType,
  };

  // inscribe
  const inscribeTxResult = generateInscribeTx({
    inscribeWallet,
    content,
    toAddress: moduleWallet.address,
    paymentUtxo: {
      txid: sendBTCTxResult.txid,
      vout: 0,
      satoshi: payAmount,
      codeType: AddressType.P2TR,
    },
    inscriptionValue,
    dust600: false,
  });

  // sendInscription
  // const inscriptionUtxo: UTXO = {
  //   txid: inscribeTxResult.txid,
  //   vout: 0,
  //   satoshi: inscriptionValue,
  //   codeType: moduleWallet.addressType,
  //   scriptPk: moduleWallet.scriptPk,
  // };

  // const sendInscriptionTxResult = generateSendInscriptionTx({
  //   inscriptionWallet: moduleWallet,
  //   inscriptionUtxo,
  //   btcWallet,
  //   btcUtxos: [nextBtcUtxo],
  //   to: {
  //     type: "address",
  //     address: moduleWallet.address,
  //   },
  //   feeRate,
  // });

  return {
    inscriptionId: inscribeTxResult.inscriptionId,
    tx1: {
      txid: sendBTCTxResult.txid,
      psbtHex: sendBTCTxResult.psbtHex,
      toSignInputs: sendBTCTxResult.toSignInputs,
    },
    tx2: {
      txid: inscribeTxResult.txid,
      rawtx: inscribeTxResult.rawtx,
    },
    // tx3: {
    //   txid: sendInscriptionTxResult.txid,
    //   psbtHex: sendInscriptionTxResult.psbtHex,
    //   toSignInputs: sendInscriptionTxResult.toSignInputs,
    // },
  };
}

export function generateDeployContractTxs({
  content,
  btcWallet,
  btcUtxos,
  moduleWallet,
  inscribeWallet,
  feeRate,
}: {
  content: string;
  btcWallet: Wallet;
  btcUtxos: UTXO[];
  moduleWallet: Wallet;
  inscribeWallet: Wallet;
  feeRate: number;
}) {
  // create inscribing order
  const inscriptionValue = 330;
  const dummyUtxo: UTXO = {
    txid: "0000000000000000000000000000000000000000000000000000000000000000",
    vout: 0,
    satoshi: 10000000,
    codeType: btcWallet.addressType,
  };

  const { virtualSize, payAddress } = generateInscribeTx({
    inscribeWallet,
    toAddress: moduleWallet.address,
    content,
    paymentUtxo: dummyUtxo,
    inscriptionValue,
    dust600: false,
  });
  const fee = Math.ceil(virtualSize * feeRate);
  const payAmount = fee + inscriptionValue;

  // pay order
  const sendBTCTxResult = generateSendBTCTx({
    wallet: btcWallet,
    utxos: btcUtxos,
    toAddress: payAddress,
    toAmount: payAmount,
    feeRate,
    dust600: false,
  });

  const nextBtcUtxo: UTXO = {
    txid: sendBTCTxResult.txid,
    vout: 1,
    satoshi: sendBTCTxResult.change,
    scriptPk: btcWallet.scriptPk,
    codeType: btcWallet.addressType,
  };

  // inscribe
  const inscribeTxResult = generateInscribeTx({
    inscribeWallet,
    content,
    toAddress: moduleWallet.address,
    paymentUtxo: {
      txid: sendBTCTxResult.txid,
      vout: 0,
      satoshi: payAmount,
      codeType: AddressType.P2TR,
    },
    inscriptionValue,
    dust600: false,
  });

  return {
    inscriptionId: inscribeTxResult.inscriptionId,
    tx1: {
      txid: sendBTCTxResult.txid,
      psbtHex: sendBTCTxResult.psbtHex,
      toSignInputs: sendBTCTxResult.toSignInputs,
    },
    tx2: {
      txid: inscribeTxResult.txid,
      rawtx: inscribeTxResult.rawtx,
    },
  };
}
