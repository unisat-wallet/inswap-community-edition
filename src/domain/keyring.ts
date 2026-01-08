import {
  ECPairInterface,
  Wallet,
  tweakOrderPrivkeyWithTag,
  tweakSigner,
} from "../lib/bitcoin";
import { aesDecrypt } from "../lib/crypto";
import { ToSignInput } from "../types/api";
import { AddressType } from "../types/domain";
import { getAddressType, sysFatal } from "./utils";

export class Keyring {
  sequencerWallet: Wallet;
  rootWallet: Wallet;
  btcWallet: Wallet;
  approveWallet: Wallet;
  accelerateWallet: Wallet;

  constructor() {
    const key = process.env.KEY;

    // load keyring with secret key
    if (config.keyring.sequencerWallet.wifWithKey) {
      config.keyring.sequencerWallet.wif = aesDecrypt(
        config.keyring.sequencerWallet.wifWithKey,
        key
      );
    }
    if (config.keyring.rootWallet.wifWithKey) {
      config.keyring.rootWallet.wif = aesDecrypt(
        config.keyring.rootWallet.wifWithKey,
        key
      );
    }
    if (config.keyring.btcWallet.wifWithKey) {
      config.keyring.btcWallet.wif = aesDecrypt(
        config.keyring.btcWallet.wifWithKey,
        key
      );
    }
    if (config.keyring.approveWallet.wifWithKey) {
      config.keyring.approveWallet.wif = aesDecrypt(
        config.keyring.approveWallet.wifWithKey,
        key
      );
    }
    if (config.keyring.accelerateWallet.wifWithKey) {
      config.keyring.accelerateWallet.wif = aesDecrypt(
        config.keyring.accelerateWallet.wifWithKey,
        key
      );
    }

    // load keyring with wif
    if (config.keyring.sequencerWallet.wif) {
      this.sequencerWallet = Wallet.fromWIF(
        config.keyring.sequencerWallet.wif,
        getAddressType(config.keyring.sequencerWallet.address)
      );
    }

    if (config.keyring.rootWallet.wif) {
      this.rootWallet = Wallet.fromWIF(
        config.keyring.rootWallet.wif,
        getAddressType(config.keyring.rootWallet.address)
      );
    }

    if (config.keyring.btcWallet.wif) {
      this.btcWallet = Wallet.fromWIF(
        config.keyring.btcWallet.wif,
        getAddressType(config.keyring.btcWallet.address)
      );
    }

    if (config.keyring.approveWallet.wif) {
      this.approveWallet = Wallet.fromWIF(
        config.keyring.approveWallet.wif,
        getAddressType(config.keyring.approveWallet.address)
      );
    }

    // load keyring with address
    if (!this.sequencerWallet) {
      this.sequencerWallet = Wallet.fromAddress(
        config.keyring.sequencerWallet.address
      );
    }

    if (!this.accelerateWallet) {
      this.accelerateWallet = Wallet.fromAddress(
        config.keyring.accelerateWallet.address
      );
    }

    if (!this.rootWallet) {
      this.rootWallet = Wallet.fromAddress(config.keyring.rootWallet.address);
    }

    if (!this.btcWallet) {
      this.btcWallet = Wallet.fromAddress(config.keyring.btcWallet.address);
    }

    if (!this.approveWallet) {
      this.approveWallet = Wallet.fromAddress(
        config.keyring.approveWallet.address
      );
    }

    if (!this.accelerateWallet) {
      this.accelerateWallet = Wallet.fromAddress(
        config.keyring.accelerateWallet.address
      );
    }

    // check if the keyring is loaded correctly
    if (
      this.sequencerWallet.address !== config.keyring.sequencerWallet.address
    ) {
      sysFatal({ tag: "", msg: "load sequencerWallet failed" });
    }

    if (this.rootWallet.address !== config.keyring.rootWallet.address) {
      sysFatal({ tag: "", msg: "load rootWallet failed" });
    }

    if (this.btcWallet.address !== config.keyring.btcWallet.address) {
      sysFatal({ tag: "", msg: "load btcWallet failed" });
    }

    if (this.approveWallet.address !== config.keyring.approveWallet.address) {
      sysFatal({ tag: "", msg: "load approveWallet failed" });
    }

    if (
      this.accelerateWallet.address !== config.keyring.accelerateWallet.address
    ) {
      sysFatal({ tag: "", msg: "load accelerateWallet failed" });
    }
  }

  deriveFromRootWallet(address: string, tag: string) {
    const _signer = tweakOrderPrivkeyWithTag(
      this.rootWallet.signer as ECPairInterface,
      tag + "_" + address
    );
    const inscribeWallet = new Wallet({
      signer: _signer,
      addressType: AddressType.P2TR,
      tweakedSigner: tweakSigner(_signer),
    });
    return inscribeWallet;
  }

  getDelegateWallet(userPubkey: string) {
    const delegateWallet = Wallet.fromMultiPubkey(
      userPubkey,
      this.approveWallet.publicKey
    );
    return delegateWallet;
  }

  async signPsbtBySequencerWallet(
    psbtHex: string,
    toSignInputs: ToSignInput[]
  ) {
    const _res = await api.signByKeyring("sequencer", psbtHex, toSignInputs);
    return _res;
  }
}
