import { base64 } from "@scure/base";
import * as bitcoin from "bitcoinjs-lib";
import { ECPair } from ".";
import { AddressType, HashIdMsg, OridinalMsg } from "../types/domain";
import { sign_fail } from "./error";
import { getAddressType, need, reverseHash } from "./utils";

const TAG = "sign";

export function getSignMsg(datas: OridinalMsg[]) {
  const prevs: string[] = [];
  let signMsg = "";
  let id = "";
  let hashidMsg = "";
  for (let i = 0; i < datas.length; i++) {
    const data = datas[i];

    // fix 10.0 to normalize number
    // const params = data.params.map((item) => {
    //   return normalizeNumberStr(item);
    // });
    const params = data.params;

    const res = hashid({
      module: data.module,
      parent: data.parent,
      gas_price: data.gas_price,
      addr: data.addr,
      func: data.func,
      params,
      prevs,
      ts: data.ts,
    });
    id = res.id;
    hashidMsg = res.hashidMsg;
    signMsg = "";
    signMsg += `id: ${id}\n`;
    signMsg += `addr: ${data.addr}\n`;
    signMsg += `func: ${data.func}\n`;
    if (params.length > 0) {
      signMsg += `params: ${params.join(" ")}\n`;
    }
    signMsg += `ts: ${data.ts}\n`;

    prevs.push(id);
  }
  prevs.shift();
  return { signMsg, hashidMsg, prevs, id, commitParent: datas[0].parent };
}

export function hashid(data: HashIdMsg) {
  let hashidMsg = "";
  hashidMsg += `module: ${data.module}\n`;
  if (data.parent) {
    hashidMsg += `parent: ${data.parent}\n`;
  }
  if (data.gas_price) {
    hashidMsg += `gas_price: ${data.gas_price}\n`;
  }
  if (data.prevs.length > 0) {
    hashidMsg += `prevs: ${data.prevs.join(" ")}\n`;
  }
  hashidMsg += `addr: ${data.addr}\n`;
  hashidMsg += `func: ${data.func}\n`;
  if (data.params.length > 0) {
    hashidMsg += `params: ${data.params.join(" ")}\n`;
  }
  hashidMsg += `ts: ${data.ts}\n`;

  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  hash.update(hashidMsg);

  const str = hash.digest("hex");
  const id = reverseHash(str);
  return { hashidMsg, id };
}

function bip0322_hash(message: string) {
  const { sha256 } = bitcoin.crypto;
  const tag = "BIP0322-signed-message";
  const tagHash = sha256(Buffer.from(tag));
  const result = sha256(
    Buffer.concat([tagHash, tagHash, Buffer.from(message)])
  );
  return result.toString("hex");
}
export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => {
  return ECPair.fromPublicKey(pubkey).verify(msghash, signature);
};

export const schnorrValidator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => {
  return ECPair.fromPublicKey(pubkey).verifySchnorr(msghash, signature);
};

export function isSignVerify(address: string, msg: string, signature: string) {
  try {
    need(!!address, "address is empty");
    need(!!msg, "message is empty");
    need(!!signature, "signature is empty");
    const addressType = getAddressType(address);
    if (addressType === AddressType.P2WPKH) {
      return verifySignatureOfBip322_P2PWPKH(address, msg, signature);
    } else if (addressType === AddressType.P2TR) {
      return verifySignatureOfBip322_P2TR(address, msg, signature);
    }
  } catch (err) {
    logger.error({
      tag: TAG,
      msg: "Error verifying signature",
      address,
      message: msg,
      signature,
      error: err.message,
      stack: err.stack,
    });
    return false;
  }
  return false;
}

export function verifySignatureOfBip322_P2PWPKH(
  address: string,
  msg: string,
  sign: string
) {
  const outputScript = bitcoin.address.toOutputScript(address, network);

  const prevoutHash = Buffer.from(
    "0000000000000000000000000000000000000000000000000000000000000000",
    "hex"
  );
  const prevoutIndex = 0xffffffff;
  const sequence = 0;
  const scriptSig = Buffer.concat([
    Buffer.from("0020", "hex"),
    Buffer.from(bip0322_hash(msg), "hex"),
  ]);

  const txToSpend = new bitcoin.Transaction();
  txToSpend.version = 0;
  txToSpend.addInput(prevoutHash, prevoutIndex, sequence, scriptSig);
  txToSpend.addOutput(outputScript, 0);

  const data = Buffer.from(base64.decode(sign));
  const _res = bitcoin.script.decompile(data.slice(1));

  const psbtToSign = new bitcoin.Psbt();
  psbtToSign.setVersion(0);
  psbtToSign.addInput({
    hash: txToSpend.getHash(),
    index: 0,
    sequence: 0,
    witnessUtxo: {
      script: outputScript,
      value: 0,
    },
  });
  psbtToSign.addOutput({ script: Buffer.from("6a", "hex"), value: 0 });

  psbtToSign.updateInput(0, {
    partialSig: [
      {
        pubkey: _res[1] as any,
        signature: _res[0] as any,
      },
    ],
  });
  const valid = psbtToSign.validateSignaturesOfAllInputs(validator);
  return valid;
}

export function verifySignatureOfBip322_P2TR(
  address: string,
  msg: string,
  sign: string
) {
  const outputScript = bitcoin.address.toOutputScript(address, network);
  const prevoutHash = Buffer.from(
    "0000000000000000000000000000000000000000000000000000000000000000",
    "hex"
  );
  const prevoutIndex = 0xffffffff;
  const sequence = 0;
  const scriptSig = Buffer.concat([
    Buffer.from("0020", "hex"),
    Buffer.from(bip0322_hash(msg), "hex"),
  ]);

  const txToSpend = new bitcoin.Transaction();
  txToSpend.version = 0;
  txToSpend.addInput(prevoutHash, prevoutIndex, sequence, scriptSig);
  txToSpend.addOutput(outputScript, 0);

  const data = Buffer.from(base64.decode(sign));
  const _res = bitcoin.script.decompile(data.slice(1));
  need(!!_res, sign_fail);
  const signature = _res[0] as Buffer;
  const pubkey = Buffer.from(
    "02" + outputScript.subarray(2).toString("hex"),
    "hex"
  );

  const psbtToSign = new bitcoin.Psbt();
  psbtToSign.setVersion(0);
  psbtToSign.addInput({
    hash: txToSpend.getHash(),
    index: 0,
    sequence: 0,
    witnessUtxo: {
      script: outputScript,
      value: 0,
    },
  });
  psbtToSign.addOutput({ script: Buffer.from("6a", "hex"), value: 0 });
  const tapKeyHash = (psbtToSign as any).__CACHE.__TX.hashForWitnessV1(
    0,
    [outputScript],
    [0],
    0
  );
  const valid = schnorrValidator(pubkey, tapKeyHash, signature);
  return valid;
}
