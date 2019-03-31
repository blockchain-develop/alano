import { Wallet } from "ethers";
import { fromMnemonic, HDNode } from "ethers/utils/hdnode";
import { Account } from "ontology-ts-sdk";

import { IStoreService } from "./services";

export const MNEMONIC_PATH = "MNEMONIC";

export async function getHDNode(storeService: IStoreService): Promise<HDNode> {
  let mnemonic = await storeService.get(MNEMONIC_PATH);

  if (!mnemonic) {
    mnemonic = Wallet.createRandom().mnemonic;
    await storeService.set([{ key: MNEMONIC_PATH, value: mnemonic }]);
  }

  // 25446 is 0x6366... or "cf" in ascii, for "Counterfactual".
  return fromMnemonic(mnemonic).derivePath("m/44'/60'/0'/25446");
}

export async function getONTNode(storeService: IStoreService): Promise<Account> {
  let mnemonic = await storeService.get(MNEMONIC_PATH);

  if (!mnemonic) {
    mnemonic = Wallet.createRandom().mnemonic;
    await storeService.set([{ key: MNEMONIC_PATH, value: mnemonic }]);
  }

  // 25446 is 0x6366... or "cf" in ascii, for "Counterfactual".
  // return fromMnemonic(mnemonic).derivePath("m/44'/60'/0'/25446");
  return Account.importWithMnemonic("label", mnemonic, "password");
}
