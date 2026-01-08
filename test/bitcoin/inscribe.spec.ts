import * as bitcoin from "bitcoinjs-lib";
import { expect } from "chai";
import { describe, it } from "mocha";
import { DUST330 } from "../../src/domain/constant";
import { Wallet, generateInscribeTx } from "../../src/lib/bitcoin";
import { UTXO } from "../../src/types/api";
import { AddressType } from "../../src/types/domain";
const dummy_txid =
  "0000000000000000000000000000000000000000000000000000000000000000";

let inscribeWallet: Wallet;
let toWallet: Wallet;

describe("inscribe", () => {
  before(() => {
    global.network = bitcoin.networks.bitcoin;
    inscribeWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    toWallet = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
  });

  it("basic", async () => {
    const paymentUtxo: UTXO = {
      txid: dummy_txid,
      vout: 0,
      satoshi: 10000,
      codeType: inscribeWallet.addressType,
      scriptPk: inscribeWallet.scriptPk,
    };

    const feeRate = 1;
    const result = generateInscribeTx({
      inscribeWallet,
      content: "hello",
      toAddress: toWallet.address,
      paymentUtxo,
      inscriptionValue: DUST330,
      dust600: false,
    });

    const psbt = bitcoin.Psbt.fromHex(result.psbtHex, { network });

    expect(psbt.txOutputs[0].address).to.eq(toWallet.address);
    expect(psbt.txOutputs[0].value).to.eq(DUST330);

    const tx = psbt.extractTransaction(true);

    expect(tx.getId()).eq(result.txid);
  });
});
