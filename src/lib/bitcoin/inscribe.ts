import { Tapleaf, Taptree } from "bitcoinjs-lib/src/types";
import { DUST294 } from "../../domain/constant";
import { UTXO } from "../../types/api";
import { TAPLEAF_VERSION } from "./const";
import { bitcoin } from "./core";
import { toXOnly } from "./utils";
import { Wallet } from "./wallet";
export function buildInscriptionPayment(
  internalPubkey: Buffer,
  leafPubkey: Buffer,
  contentType: string,
  content: string
) {
  let yourScript = [
    toXOnly(leafPubkey),
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    Buffer.from("ord"),
    1,
    1,
  ];

  const contentBuffer = Buffer.from(contentType);
  if (contentBuffer.length == 1) {
    yourScript.push(1);
    yourScript.push(contentBuffer[0]);
  } else {
    yourScript.push(contentBuffer);
  }

  yourScript.push(bitcoin.opcodes.OP_0);

  const chunkSize = 520;
  const originalBuffer = Buffer.from(content);
  const contentBuffers = [];
  for (let i = 0; i < originalBuffer.length; i += chunkSize) {
    const chunk = originalBuffer.slice(i, i + chunkSize);
    if (i + chunkSize >= originalBuffer.length && chunk.length == 1) {
      contentBuffers.push(1);
      contentBuffers.push(chunk[0]);
    } else {
      contentBuffers.push(chunk);
    }
  }

  yourScript = yourScript.concat(contentBuffers);
  yourScript.push(bitcoin.opcodes.OP_ENDIF);

  const tapLeaf: Tapleaf = {
    output: bitcoin.script.compile(yourScript),
    version: TAPLEAF_VERSION,
  };

  const tapTree: Taptree = tapLeaf;

  const payment = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree: tapTree,
    redeem: {
      output: tapLeaf.output,
    },
    network,
  });

  const tapLeafScript = [
    {
      leafVersion: TAPLEAF_VERSION,
      script: tapLeaf.output,
      controlBlock: payment.witness![payment.witness!.length - 1],
    },
  ];

  const tapMerkleRoot = payment.hash;
  const tapLeafHashToSign = payment.hash;
  const utxoScript = payment.output as Buffer;
  return {
    address: payment.address,
    utxoScript,
    tapLeafScript,
    tapLeafHashToSign,
    tapMerkleRoot,
    payment,
  };
}

export function generateInscribeTx({
  inscribeWallet,
  content,
  toAddress,
  paymentUtxo,
  inscriptionValue,
  change,
  dust600,
}: {
  inscribeWallet: Wallet;
  content: string;
  toAddress: string;
  paymentUtxo: UTXO;
  inscriptionValue: number;
  change?: {
    address: string;
    value: number;
  };
  dust600: boolean;
}) {
  const internalPubkey = toXOnly(inscribeWallet.publicKey);
  const leafPrivkey = inscribeWallet.signer;
  const leafPubkey = leafPrivkey.publicKey;
  const contentType = "text/plain;charset=utf-8";
  const payment = buildInscriptionPayment(
    internalPubkey,
    leafPubkey,
    contentType,
    content
  );

  const psbt = new bitcoin.Psbt({ network });

  psbt.addInput({
    hash: paymentUtxo.txid,
    index: paymentUtxo.vout,
    witnessUtxo: {
      value: paymentUtxo.satoshi,
      script: payment.utxoScript,
    },
    tapLeafScript: payment.tapLeafScript,
  });
  psbt.setInputSequence(0, 0xfffffffd);

  psbt.addOutput({
    address: toAddress,
    value: inscriptionValue,
  }); // o0

  if (change) {
    psbt.addOutput({
      address: change.address,
      value: change.value,
    });
  }

  if (dust600) {
    psbt.addOutput({
      address: keyring.accelerateWallet.address,
      value: DUST294,
    });
  }

  psbt.signTaprootInput(0, leafPrivkey, payment.tapLeafHashToSign);

  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction(true);
  const txid = tx.getId();
  const virtualSize = tx.virtualSize();
  const inscriptionId = txid + "i0";
  const rawtx = tx.toHex();
  const psbtHex = psbt.toHex();

  return {
    inscriptionId,
    txid,
    rawtx,
    virtualSize,
    payAddress: payment.address,
    psbtHex,
    change,
  };
}
