import { expect } from "chai";
import { describe, it } from "mocha";
import { getModuleIdHex } from "../../src/domain/utils";
import {
  Wallet,
  bitcoin,
  generateSendInscriptionTx,
} from "../../src/lib/bitcoin";
import { UTXO } from "../../src/types/api";
import { AddressType } from "../../src/types/domain";
const dummy_txid =
  "0000000000000000000000000000000000000000000000000000000000000000";
const dummy_moduleId =
  "1460b9d66137e63aaa88dc4f4bbd0398c3cd475a1de1349e08284d752da4eaeai0";

let inscriptionWallet: Wallet;
let btcWallet: Wallet;

describe("send-inscription", () => {
  before(() => {
    global.network = bitcoin.networks.bitcoin;
    inscriptionWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    btcWallet = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
  });

  it("to address", async () => {
    const inscriptionUtxo: UTXO = {
      txid: dummy_txid,
      vout: 0,
      satoshi: 330,
      codeType: inscriptionWallet.addressType,
      scriptPk: inscriptionWallet.scriptPk,
    };

    const btcUtxos: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 1,
        satoshi: 10000000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const feeRate = 1;
    const result = generateSendInscriptionTx({
      inscriptionUtxo,
      inscriptionWallet,
      btcUtxos,
      btcWallet,
      feeRate,
      to: {
        type: "address",
        address: inscriptionWallet.address,
      },
      dust600: false,
    });

    const psbt = bitcoin.Psbt.fromHex(result.psbtHex, { network });
    result.toSignInputs.forEach((v) => {
      if (v.address === inscriptionWallet.address) {
        inscriptionWallet.signPsbtInput(psbt, v.index);
      } else if (v.address === btcWallet.address) {
        btcWallet.signPsbtInput(psbt, v.index);
      }
    });
    psbt.finalizeAllInputs();
    expect(psbt.getFeeRate()).to.eq(feeRate);

    expect(psbt.txOutputs[0].address).to.eq(inscriptionWallet.address);

    const tx = psbt.extractTransaction(true);

    expect(tx.getId()).eq(result.txid);
  });

  it("to opreturn", async () => {
    const inscriptionUtxo: UTXO = {
      txid: dummy_txid,
      vout: 0,
      satoshi: 330,
      codeType: inscriptionWallet.addressType,
      scriptPk: inscriptionWallet.scriptPk,
    };

    const btcUtxos: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 1,
        satoshi: 10000000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const opreturnData = [getModuleIdHex(dummy_moduleId)];
    const feeRate = 1;
    const result = generateSendInscriptionTx({
      inscriptionUtxo,
      inscriptionWallet,
      btcUtxos,
      btcWallet,
      feeRate,
      to: {
        type: "opreturn",
        opreturnData,
      },
      dust600: false,
    });

    const psbt = bitcoin.Psbt.fromHex(result.psbtHex, { network });
    result.toSignInputs.forEach((v) => {
      if (v.address === inscriptionWallet.address) {
        inscriptionWallet.signPsbtInput(psbt, v.index);
      } else if (v.address === btcWallet.address) {
        btcWallet.signPsbtInput(psbt, v.index);
      }
    });
    psbt.finalizeAllInputs();

    expect(psbt.getFeeRate()).to.eq(feeRate);

    expect(psbt.txOutputs[0].script.toString("hex")).eq(
      bitcoin.script
        .compile([bitcoin.opcodes.OP_RETURN, getModuleIdHex(dummy_moduleId)])
        .toString("hex")
    );
    expect(psbt.txOutputs[0].value).to.eq(1);

    const tx = psbt.extractTransaction(true);

    expect(tx.getId()).eq(result.txid);
  });
});
