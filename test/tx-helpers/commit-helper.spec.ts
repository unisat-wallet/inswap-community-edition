import * as bitcoin from "bitcoinjs-lib";
import { expect } from "chai";
import { describe, it } from "mocha";
import { Wallet, printPsbt } from "../../src/lib/bitcoin";
import { generateCommitTxs } from "../../src/lib/tx-helpers/commit-helper";
import { UTXO } from "../../src/types/api";
import { AddressType } from "../../src/types/domain";
import { CommitOp, OpType } from "../../src/types/op";

const dummy_op: CommitOp = {
  p: "brc20-swap",
  op: "commit" as OpType.commit,
  module: "1460b9d66137e63aaa88dc4f4bbd0398c3cd475a1de1349e08284d752da4eaeai0",
  parent: "16d7f7a2c9537265233d2377275c568a7d4bbcde116ef1fe19f07c1bf770ae4di0",
  gas_price: "0",
  data: [
    {
      id: "c6f4a4a44216a763d74b90ea4445b36fad329fe413f0c47b55524ff2ba3ab811",
      func: "swap",
      params: [
        "sats/test",
        "test",
        "1",
        "exactIn",
        "0.967830460108690744",
        "0.005",
      ],
      addr: "tb1p8tf3csd75fhlwe7u42hx92rgvxgu7vycjmslrppz4rd0gggv2t5q3fj52n",
      ts: 1696504078,
      sig: "AUBXtWgnccIgl1pSBmTTFE/V8lX4Q46bKUNGhsrGV0u8YbWwwKeQ1rbD0LfL2lCGR9r+OvogJNkPhxQy7t2G4jk1",
    },
    {
      id: "473f9b5b7453892a7771a4b5499a99cd3ecaaf129ab4a7ea098b37738aface7f",
      func: "swap",
      params: [
        "sats/test",
        "test",
        "1",
        "exactIn",
        "0.949065278318570106",
        "0.005",
      ],
      addr: "tb1p8tf3csd75fhlwe7u42hx92rgvxgu7vycjmslrppz4rd0gggv2t5q3fj52n",
      ts: 1696504103,
      sig: "AUD7PfPWRW53vrX93fSu0OvCUmfqd7mmT1ZZPahhijy+ZC5L7Y7yZkfA2mpq3DhOhj1vouC7rvbgJ49rzNlQsgLA",
    },
    {
      id: "5decbccec15a9d0b3178ecc4115fc4560b2d3a55eebaff5f349d0008a1f26603",
      func: "swap",
      params: [
        "sats/test",
        "test",
        "1",
        "exactIn",
        "0.930840874145351796",
        "0.005",
      ],
      addr: "tb1p8tf3csd75fhlwe7u42hx92rgvxgu7vycjmslrppz4rd0gggv2t5q3fj52n",
      ts: 1696504125,
      sig: "AUCAg2rSRe+Fzba2BXAtr6rEJWOpTCd3UggfqgU+PNJYOayehQ9F3rDoR6HV8m9wgFcKg3xqTlsUBqKwVthHmUMo",
    },
  ],
};
const dummy_txid =
  "0000000000000000000000000000000000000000000000000000000000000000";
let sequencerWallet: Wallet;
let inscribeRootWalelt: Wallet;
let inscribeWallet: Wallet;
let btcWallet: Wallet;
let seqWallet: Wallet;
describe("commit-helper", () => {
  before(async () => {
    global.network = bitcoin.networks.testnet;
    (global as any).config = {
      moduleId: dummy_op.module,
    };
    sequencerWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    inscribeRootWalelt = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
    inscribeWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    btcWallet = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
    seqWallet = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
  });

  it("generateCommitTxs", async () => {
    const btcUtxosA: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 0,
        satoshi: 40000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const btcUtxosB: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 1,
        satoshi: 40000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const seqUtxo: UTXO = {
      txid: dummy_txid,
      vout: 2,
      satoshi: 546,
      codeType: btcWallet.addressType,
      scriptPk: seqWallet.scriptPk,
    };
    const feeRate = 1;
    const {
      inscriptionId,
      nextBtcUtxoA,
      nextBtcUtxoB,
      nextSeqUtxo,
      tx1,
      tx2,
      tx3,
    } = generateCommitTxs({
      op: dummy_op,
      sequencerWallet,
      inscribeWallet,
      seqWallet,
      seqUtxo,
      btcWallet,
      btcUtxosA,
      btcUtxosB,
      feeRate,
    });

    const psbt1 = bitcoin.Psbt.fromHex(tx1.psbtHex, { network });
    tx1.toSignInputs.forEach((v) => {
      btcWallet.signPsbtInput(psbt1, v.index);
    });
    psbt1.finalizeAllInputs();

    expect(psbt1.extractTransaction(true).getId()).to.eq(tx1.txid);
    expect(psbt1.getFeeRate()).to.eq(feeRate);
    printPsbt(psbt1);

    const psbt2 = bitcoin.Psbt.fromHex(tx2.psbtHex, { network });
    printPsbt(psbt2);

    const psbt3 = bitcoin.Psbt.fromHex(tx3.psbtHex, { network });
    tx3.toSignInputs.forEach((v) => {
      if (v.address === btcWallet.address) {
        btcWallet.signPsbtInput(psbt3, v.index);
      } else if (v.address === seqWallet.address) {
        seqWallet.signPsbtInput(psbt3, v.index);
      } else if (v.address === sequencerWallet.address) {
        sequencerWallet.signPsbtInput(psbt3, v.index);
      }
    });
    psbt3.finalizeAllInputs();
    expect(psbt3.getFeeRate()).to.eq(feeRate);

    expect(psbt3.extractTransaction(true).getId()).to.eq(tx3.txid);

    expect(nextBtcUtxoA.satoshi).to.eq(
      psbt1.txOutputs[psbt1.txOutputs.length - 1].value
    );
    expect(nextBtcUtxoB.satoshi).to.eq(
      psbt3.txOutputs[psbt3.txOutputs.length - 1].value
    );
    expect(nextSeqUtxo.satoshi).to.eq(seqUtxo.satoshi);
  });
});
