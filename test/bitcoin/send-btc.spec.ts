import * as bitcoin from "bitcoinjs-lib";
import { expect } from "chai";
import { describe, it } from "mocha";
import { config } from "../../src//config";
import { Wallet, generateSendBTCTx } from "../../src/lib/bitcoin";
import { UTXO } from "../../src/types/api";
import { AddressType } from "../../src/types/domain";
import { DateLogger } from "../../src/utils/logger";
const dummy_txid =
  "0000000000000000000000000000000000000000000000000000000000000000";

let btcWallet: Wallet;
let toWallet: Wallet;
describe("send-btc", () => {
  before(() => {
    global.config = config;
    global.logger = new DateLogger();
    global.network = bitcoin.networks.bitcoin;
    btcWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    toWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
  });

  it("one utxo", async () => {
    const utxos: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 1,
        satoshi: 10000000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const feeRate = 1;
    const toAmount = 10000;
    const result = generateSendBTCTx({
      utxos,
      wallet: btcWallet,
      feeRate,
      toAddress: toWallet.address,
      toAmount,
      dust600: false,
    });

    const psbt = bitcoin.Psbt.fromHex(result.psbtHex, { network });
    result.toSignInputs.forEach((v) => {
      if (v.address === btcWallet.address) {
        btcWallet.signPsbtInput(psbt, v.index);
      }
    });
    psbt.finalizeAllInputs();

    expect(psbt.getFeeRate()).to.eq(feeRate);
    expect(psbt.txOutputs[0].address).to.eq(toWallet.address);
    expect(psbt.txOutputs[1].address).to.eq(btcWallet.address);
    const tx = psbt.extractTransaction(true);
    expect(tx.getId()).eq(result.txid);
  });

  it("multiple utxo", async () => {
    const utxos: UTXO[] = [];
    for (let i = 0; i < 10; i++) {
      utxos.push({
        txid: dummy_txid,
        vout: i,
        satoshi: 10000000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      });
    }

    const feeRate = 1;
    const toAmount = 10000;
    const result = generateSendBTCTx({
      utxos,
      wallet: btcWallet,
      feeRate,
      toAddress: toWallet.address,
      toAmount,
      dust600: false,
    });

    const psbt = bitcoin.Psbt.fromHex(result.psbtHex, { network });
    result.toSignInputs.forEach((v) => {
      if (v.address === btcWallet.address) {
        btcWallet.signPsbtInput(psbt, v.index);
      }
    });
    psbt.finalizeAllInputs();

    expect(psbt.getFeeRate()).to.eq(feeRate);
    expect(psbt.txOutputs[0].address).to.eq(toWallet.address);
    expect(psbt.txOutputs[1].address).to.eq(btcWallet.address);
    const tx = psbt.extractTransaction(true);
    expect(tx.getId()).eq(result.txid);
  });
});
