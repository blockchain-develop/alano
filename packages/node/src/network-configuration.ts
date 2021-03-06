import RopstenContracts from "@counterfactual/contracts/networks/3.json";
import RinkebyContracts from "@counterfactual/contracts/networks/4.json";
import KovanContracts from "@counterfactual/contracts/networks/42.json";
import { NetworkContext } from "@counterfactual/types";

import { ERRORS } from "./methods/errors";

export const SUPPORTED_NETWORKS = new Set(["ropsten", "rinkeby", "kovan"]);

export function configureNetworkContext(network: string): NetworkContext {
  console.log(`Configuring Node to use contracts on network: ${network}`);

  switch (network.toLocaleLowerCase()) {
    case "ropsten": {
      return getContractAddressesForNetwork(RopstenContracts);
    }
    case "rinkeby": {
      return getContractAddressesForNetwork(RinkebyContracts);
    }
    case "kovan": {
      return getContractAddressesForNetwork(KovanContracts);
    }
    case "ont": {
      return getOntContractAddresses();
    }
    default: {
      throw Error(
        `${ERRORS.INVALID_NETWORK_NAME}: ${network}. \n
         The following networks are supported:
         ${Array.from(SUPPORTED_NETWORKS.values())}`
      );
    }
  }
}

interface Migration {
  contractName: string;
  address: string;
  transactionHash: string;
}

function getContractAddressesForNetwork(
  migrations: Migration[]
): NetworkContext {
  return {
    AppRegistry: getContractAddress(migrations, "AppRegistry"),
    ETHBalanceRefund: getContractAddress(migrations, "ETHBalanceRefundApp"),
    ETHBucket: getContractAddress(migrations, "ETHBucket"),
    MultiSend: getContractAddress(migrations, "MultiSend"),
    NonceRegistry: getContractAddress(migrations, "NonceRegistry"),
    StateChannelTransaction: getContractAddress(
      migrations,
      "StateChannelTransaction"
    ),
    ETHVirtualAppAgreement: getContractAddress(
      migrations,
      "ETHVirtualAppAgreement"
    ),
    MinimumViableMultisig: getContractAddress(
      migrations,
      "MinimumViableMultisig"
    ),
    ProxyFactory: getContractAddress(migrations, "ProxyFactory")
  };
}

function getOntContractAddresses(): NetworkContext {
  return {
    AppRegistry: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    ETHBalanceRefund: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    ETHBucket: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    MultiSend: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    NonceRegistry: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    StateChannelTransaction: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    ETHVirtualAppAgreement: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    MinimumViableMultisig: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba',
    ProxyFactory: '20a24ea0d96ac4a9191b2bb84b2b4ca443ad10ba'
  }
}

function getContractAddress(migrations: Migration[], contract: string): string {
  return migrations.filter(migration => {
    return migration.contractName === contract;
  })[0].address;
}
