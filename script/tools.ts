import fs from "fs";
import { need } from "../src/contract/contract-utils";
import { API } from "../src/domain/api";
import { DUST330, DUST546 } from "../src/domain/constant";
import { VPsbt } from "../src/domain/vpsbt";
import { init } from "../src/init";
import { Wallet, bitcoin, printPsbt } from "../src/lib/bitcoin";
import {
  generateDeployContractTxs,
  generateDeployModuleTxs,
} from "../src/lib/tx-helpers";
import { CommitUTXO, UTXO } from "../src/types/api";

function sleep(sec: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, sec * 1000);
  });
}

export async function accelerateCommitTx(feeRate: number) {
  await init(false);

  const txs = await sequencerTxDao.find(
    {
      status: { $in: ["unconfirmed", "pending"] },
    },
    { sort: { _id: 1 } }
  );
  const utxoB = await sequencerUtxoDao.find(
    {
      used: "unused",
      purpose: "activate",
    },
    { sort: { satoshi: -1 } }
  );
  const utxoC = await sequencerUtxoDao.find(
    {
      used: "unused",
      purpose: "sequence",
    },
    { sort: { satoshi: -1 } }
  );

  // Resubstitute the unconfirmed items first
  let lastUtxoCTxid: string = null as unknown as string;
  for (let i = 0; i < txs.length; i++) {
    try {
      const tx = bitcoin.Transaction.fromHex(txs[i].rawtx!);
      if (tx.outs[0].value == 1) {
        lastUtxoCTxid = txs[i].txid;
      }
      await api.broadcast(txs[i].rawtx!);
    } catch (err) {
      if (err.message == "Transaction already in block chain") {
        console.log("already in block chain, txid: ", txs[i].txid);
        continue;
      } else {
        console.log("broadcast fail, txid:  ", txs[i].txid, err.message);
        process.exit(1);
      }
    }
    console.log("broadcast success, txid: ", txs[i].txid);
  }
  need(lastUtxoCTxid == utxoC[0].txid, `${lastUtxoCTxid} !== ${utxoC[0].txid}`);

  // Construct an accelerated transaction
  const vpsbt = new VPsbt();
  vpsbt.addInput(keyring.btcWallet.toPsbtInput(utxoC[0]));
  vpsbt.addInput(keyring.btcWallet.toPsbtInput(utxoB[0]));

  const bigUtxo = await api.utxo(
    "627ac2c14ed9b9a81975d8659743c8261d9bbb7b61e338c2558976d5174076e4",
    0
  );
  vpsbt.addInput(keyring.btcWallet.toPsbtInput(bigUtxo));

  vpsbt.addOutput({
    address: keyring.btcWallet.address!,
    value: utxoC[0].satoshi,
  });
  // change
  vpsbt.addOutput({ address: keyring.btcWallet.address!, value: DUST546 });
  const networkFee = vpsbt.estimateNetworkFee(feeRate);
  const change = vpsbt.getLeftAmount() - networkFee;
  need(change > 0, "change: " + change);
  let hasNextUtxoB = false;
  if (change > DUST546) {
    vpsbt.updateOutput(1, {
      address: keyring.btcWallet.address!,
      value: change,
    });
    hasNextUtxoB = true;
  }
  const psbt = vpsbt.toPsbt();
  psbt.setInputSequence(0, 0xfffffffd);
  psbt.setInputSequence(1, 0xfffffffd);
  psbt.setInputSequence(2, 0xfffffffd);
  psbt.signAllInputs(keyring.btcWallet.signer);
  psbt.finalizeAllInputs();

  console.log("change: " + change);

  const tx = psbt.extractTransaction(true);
  await api.broadcast(tx.toHex());
  console.log("broadcast accelerate tx success: ", tx.getId());
  console.log("please wait for indexer ...");

  let nextUtxoC: UTXO;
  let nextUtxoB: UTXO;
  while (true) {
    try {
      nextUtxoC = await api.utxo(tx.getId(), 0);
      need(!!nextUtxoC, "utxoC is null");
      if (hasNextUtxoB) {
      }
      nextUtxoB = await api.utxo(tx.getId(), 1);
      need(!!nextUtxoB, "utxoB is null");
      break;
    } catch (err) {
      console.error("query utxo fail, wait for a moment: ", err.message);
      await sleep(1);
      continue;
    }
  }

  // change utxo status
  await sequencerUtxoDao.updateOne(
    { txid: utxoC[0].txid, vout: utxoC[0].vout },
    { $set: { used: "used" } }
  );
  console.log("update utxo: ", utxoC[0].txid, utxoC[0].vout);

  await sequencerUtxoDao.updateOne(
    { txid: utxoB[0].txid, vout: utxoB[0].vout },
    { $set: { used: "used" } }
  );
  console.log("update utxo: ", utxoB[0].txid, utxoB[0].vout);

  await sequencerUtxoDao.insert(
    Object.assign(nextUtxoC, {
      used: "unused",
      status: "unconfirmed",
      purpose: "sequence",
    }) as any
  );
  console.log("update utxo: ", nextUtxoC.txid, nextUtxoC.vout);

  if (nextUtxoB) {
    await sequencerUtxoDao.insert(
      Object.assign(nextUtxoB, {
        used: "unused",
        status: "unconfirmed",
        purpose: "activate",
      }) as any
    );
    console.log("update utxo: ", nextUtxoB.txid, nextUtxoB.vout);
  }
}

/**
 * Deploy contract
 * @param moduleWallet module wallet, the module will be deployed to this wallet
 * @param inscribeWallet the inscribe wallet, can be the same as moduleWallet
 * @param btcWallet the btc wallet, the fee will be paid by this wallet
 * @param feeRate the fee rate for the transaction
 */
async function deployContract({
  moduleWallet,
  inscribeWallet,
  btcWallet,
  feeRate,
}: {
  moduleWallet: Wallet;
  inscribeWallet: Wallet;
  btcWallet: Wallet;
  feeRate: number;
}) {
  const api = new API();

  const data = fs.readFileSync("./build/contract.js");
  if (!data) {
    throw new Error("contract.js not build");
  }

  const content = data.toString();

  const btcUtxos = await api.addressUTXOs(btcWallet.address as string, 0, 100);

  const result = generateDeployContractTxs({
    content,
    moduleWallet,
    inscribeWallet,
    btcUtxos,
    btcWallet: btcWallet,
    feeRate,
  });

  const psbt1 = bitcoin.Psbt.fromHex(result.tx1.psbtHex, {
    network,
  });
  moduleWallet.signPsbtInputs(psbt1, result.tx1.toSignInputs);
  btcWallet.signPsbtInputs(psbt1, result.tx1.toSignInputs);
  psbt1.finalizeAllInputs();

  const txid = await api.broadcast(psbt1.extractTransaction(true).toHex());
  console.log("Deploy Contract Success: ", txid);
}

/**
 * Deploy module
 * @param op the module operation
 * @param moduleWallet module wallet, the module will be deployed to this wallet
 * @param inscribeWallet the inscribe wallet, can be the same as moduleWallet
 * @param btcWallet the btc wallet, the fee will be paid by this wallet
 * @param feeRate the fee rate for the transaction
 */
async function deployModule({
  op,
  moduleWallet,
  inscribeWallet,
  btcWallet,
  feeRate,
}: {
  op;
  moduleWallet: Wallet;
  inscribeWallet: Wallet;
  btcWallet: Wallet;
  feeRate;
}) {
  const api = new API();
  const btcUtxos = await api.addressUTXOs(btcWallet.address as string, 0, 100);
  const result = generateDeployModuleTxs({
    op,
    moduleWallet,
    inscribeWallet,
    btcWallet,
    btcUtxos,
    feeRate,
  });

  const psbt1 = bitcoin.Psbt.fromHex(result.tx1.psbtHex, {
    network,
  });
  btcWallet.signPsbtInputs(psbt1, result.tx1.toSignInputs);
  psbt1.finalizeAllInputs();
  printPsbt(psbt1);

  // 1. broadcast the commit rawtx
  console.log("rawtx1:", psbt1.extractTransaction(true).toHex());

  // 2. broadcast the reveal rawtx
  console.log("rawtx2:", result.tx2.rawtx);
}

/**
 * Split UTXOs for sequencer to inscribe and activate
 * @param btcWallet the btc wallet
 * @param feeRate the fee rate for the transaction
 */
async function splitUTXO({
  btcWallet,
  feeRate,
  utxo,
  inscribeCount,
  eachInscribeAmount,
  activateCount,
  eachAcitvateAmount,
  addSequenceUtxo,
}: {
  btcWallet: Wallet;
  feeRate: number;
  utxo: {
    txid: string;
    index: number;
  };
  inscribeCount: number;
  eachInscribeAmount: number;
  activateCount: number;
  eachAcitvateAmount: number;
  addSequenceUtxo: boolean;
}) {
  const api = new API();
  // let utxos = await api.addressUTXOs(btcWallet.address as string);
  const _utxo = await api.utxo(utxo.txid, utxo.index);
  const utxos = [_utxo];

  const vpsbt = new VPsbt();
  let inputAmount = 0;
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    vpsbt.addInput(btcWallet.toPsbtInput(utxo));
    inputAmount += utxo.satoshi;
  }
  console.log(utxos, inputAmount);

  let outputIndex = 0;
  let utxoTmpArr: {
    index: number;
    value: number;
    purpose: "inscribe" | "activate" | "sequence";
  }[] = [];
  for (let i = 0; i < inscribeCount; i++) {
    vpsbt.addOutput({
      address: btcWallet.address as string,
      value: eachInscribeAmount,
    }); // o0
    utxoTmpArr.push({
      index: outputIndex,
      value: eachInscribeAmount,
      purpose: "inscribe",
    });
    outputIndex++;
  }
  for (let i = 0; i < activateCount; i++) {
    vpsbt.addOutput({
      address: btcWallet.address as string,
      value: eachAcitvateAmount,
    }); // o0
    utxoTmpArr.push({
      index: outputIndex,
      value: eachAcitvateAmount,
      purpose: "activate",
    });
    outputIndex++;
  }
  vpsbt.addOutput({ address: btcWallet.address as string, value: DUST330 }); // o1
  if (addSequenceUtxo) {
    utxoTmpArr.push({
      index: outputIndex,
      value: DUST330,
      purpose: "sequence",
    });
  }
  outputIndex++;

  vpsbt.addOutput({ address: btcWallet.address as string, value: DUST546 }); // o1

  const left = vpsbt.getLeftAmount();

  const networkFee = vpsbt.estimateNetworkFee(feeRate);
  const change = left + DUST546 - networkFee;

  vpsbt.updateOutput(vpsbt.outputs.length - 1, {
    address: btcWallet.address as string,
    value: change,
  });
  const psbt = vpsbt.toPsbt();
  psbt.signAllInputs(btcWallet.signer);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction(true);
  const txid = tx.getId();
  const rawtx = tx.toHex();

  // 1. confirm the transaction detail
  printPsbt(psbt);

  // 2.broadcast the rawtx
  console.log(rawtx);

  let str = "";
  let commitUTXOs: CommitUTXO[] = [];
  utxoTmpArr.forEach((tmpUtxo) => {
    const commitUTXO: CommitUTXO = {
      txid,
      vout: tmpUtxo.index,
      satoshi: tmpUtxo.value,
      scriptPk: btcWallet.scriptPk,
      codeType: btcWallet.addressType,
      used: "unused",
      status: "unconfirmed",
      purpose: tmpUtxo.purpose,
    };
    commitUTXOs.push(commitUTXO);
    console.log(`db.sequencer_utxo.insert(${JSON.stringify(commitUTXO)})`);
  });

  // 3. save the commitUTXOs to db
  console.log(str);
}

async function fetchUtxos(btcWallet: Wallet) {
  const api = new API();
  const utxos = await api.addressUTXOs(btcWallet.address as string, 0, 100);
  utxos.sort((a, b) => b.satoshi - a.satoshi);
  let commitUTXOs: CommitUTXO[] = [];
  let inscribeCount = 0;
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    const commitUTXO: CommitUTXO = {
      txid: utxo.txid,
      vout: utxo.vout,
      satoshi: utxo.satoshi,
      scriptPk: btcWallet.scriptPk,
      codeType: btcWallet.addressType,
      used: "unused",
      status: "confirmed",
      purpose: "inscribe",
    };
    commitUTXOs.push(commitUTXO);

    if (commitUTXO.satoshi == 330) {
      commitUTXO.purpose = "sequence";
    } else if (inscribeCount < 20) {
      commitUTXO.purpose = "inscribe";
      inscribeCount++;
    } else {
      commitUTXO.purpose = "activate";
    }
    console.log(`db.sequencer_utxo.insert(${JSON.stringify(commitUTXO)})`);
  }
  console.log(utxos.length, commitUTXOs.length);
}

export const deployTools = {
  deployContract,
  deployModule,
  splitUTXO,
  fetchUtxos,
};
