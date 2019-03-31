import { StateChannel, xkeyKthAddress } from "@counterfactual/machine";
import {
  AssetType,
  Node,
  SolidityABIEncoderV2Struct
} from "@counterfactual/types";
import { AddressZero, MaxUint256, Zero, HashZero } from "ethers/constants";
import { TransactionRequest, TransactionResponse } from "ethers/providers";
import { BigNumber, bigNumberify } from "ethers/utils";
import { Parameter, ParameterType, utils, Crypto, TransactionBuilder } from "ontology-ts-sdk";
import { client } from "ontology-dapi";
//import { client, ParameterType as DParameterType, Parameter as DParameter } from "ontology-dapi";

import { RequestHandler } from "../../../request-handler";
import { NODE_EVENTS } from "../../../types";
import { getPeersAddressFromChannel } from "../../../utils";
import { ERRORS } from "../../errors";

export interface ETHBalanceRefundAppState extends SolidityABIEncoderV2Struct {
  recipient: string;
  multisig: string;
  threshold: BigNumber;
}

export async function installBalanceRefundApp(
  requestHandler: RequestHandler,
  params: Node.DepositParams
) {
  const {
    publicIdentifier,
    instructionExecutor,
    networkContext,
    store,
    provider
  } = requestHandler;

  const [peerAddress] = await getPeersAddressFromChannel(
    publicIdentifier,
    store,
    params.multisigAddress
  );

  const stateChannel = await store.getStateChannel(params.multisigAddress);

  const initialState: ETHBalanceRefundAppState = {
    recipient: xkeyKthAddress(publicIdentifier, 0),
    multisig: stateChannel.multisigAddress,
    threshold: await provider.getBalance(params.multisigAddress)
  };

  const stateChannelsMap = await instructionExecutor.runInstallProtocol(
    new Map<string, StateChannel>([
      // TODO: (architectural decision) Should this use `getAllChannels` or
      //       is this good enough? InstallProtocol only operates on a single
      //       channel, anyway. PR #532 might make this question obsolete.
      [stateChannel.multisigAddress, stateChannel]
    ]),
    {
      initialState,
      initiatingXpub: publicIdentifier,
      respondingXpub: peerAddress,
      multisigAddress: stateChannel.multisigAddress,
      aliceBalanceDecrement: Zero,
      bobBalanceDecrement: Zero,
      signingKeys: stateChannel.getNextSigningKeys(),
      terms: {
        // TODO: generalize
        assetType: AssetType.ETH,
        limit: MaxUint256,
        token: AddressZero
      },
      appInterface: {
        addr: networkContext.ETHBalanceRefund,
        stateEncoding:
          "tuple(address recipient, address multisig,  uint256 threshold)",
        actionEncoding: undefined
      },
      // this is the block-time equivalent of 7 days
      defaultTimeout: 1008
    }
  );

  await store.saveStateChannel(stateChannelsMap.get(params.multisigAddress)!);
}

export async function makeDepositEth(
  requestHandler: RequestHandler,
  params: Node.DepositParams
  ): Promise<string> {
  const { multisigAddress, amount } = params;
  const { provider, blocksNeededForConfirmation } = requestHandler;

  const signer = await requestHandler.getSigner();

  const tx: TransactionRequest = {
    to: multisigAddress,
    value: bigNumberify(amount),
    gasLimit: 30000,
    gasPrice: await provider.getGasPrice()
  };

  let txResponse: TransactionResponse;

  let retryCount = 3;
  while (retryCount > 0) {
    try {
      txResponse = await signer.sendTransaction(tx);
      break;
    } catch (e) {
      if (e.toString().includes("reject") || e.toString().includes("denied")) {
        console.error(`${ERRORS.DEPOSIT_FAILED}: ${e}`);
        throw e;
      }

      retryCount -= 1;

      if (retryCount === 0) {
        throw new Error(`${ERRORS.DEPOSIT_FAILED}: ${e}`);
      }
    }
  }

  await provider.waitForTransaction(
    txResponse!.hash as string,
    blocksNeededForConfirmation
  );

  return txResponse!.hash! 
}

export async function makeDepositOnt(
  requestHandler: RequestHandler,
  params: Node.DepositParams
  ): Promise<string> {
  const { multisigAddress, amount } = params;
  const {
    networkContext,
    ontclient,
    ontaccount
  } = requestHandler;

  const signer = await requestHandler.getOntSigner();

  if (signer == 1) {
    const scriptHash = networkContext.StateChannelTransaction;
    const operation = utils.str2hexstr("deposit");
    //const p1 = new DParameter('from', DParameterType.string, multisigAddress);
    //const p2 = new DParameter('from', DParameterType.Int, amount);
    //const args : DParameter[] = [{type: 'string', value: multisigAddress}, {type: {'int'}, value: amount}];
    //const args;
    //const response = await client.api.smartContract.invoke({scriptHash, operation, args, 500, 200000});
    const response = await client.api.smartContract.invoke({scriptHash, operation});
    console.log("ontology deposit response: " + JSON.stringify(response));

    //const notifys = response.Result.Notify;
    const txhash = response.transaction;
    return txhash;
  } else {
    const p1 = new Parameter('from', ParameterType.String, multisigAddress);
    const p2 = new Parameter('from', ParameterType.Int, amount);
    const contractAddr = new Crypto.Address(utils.reverseHex(networkContext.StateChannelTransaction));
    const tx = TransactionBuilder.makeInvokeTransaction(utils.str2hexstr("deposit"), [p1, p2], contractAddr, '500', '200000', ontaccount.address);
    TransactionBuilder.signTransaction(tx, ontaccount.exportPrivateKey("password"));
    const response = await ontclient.sendRawTransaction(tx.serialize(), true);
    console.log("ontology deposit response: " + JSON.stringify(response));

    //const notifys = response.Result.Notify;
    const state = response.Result.State;
    if (state == 1) {
      /*
      for (const notify of notifys) {
        if (notify.ContractAddress == networkContext.StateChannelTransaction) {
          const event = notify.States;
          if (event[0] == utils.str2hexstr("deposit")) {
            return event[1];
          }
        }
      }
      */
      return HashZero;
    } else {
      return Promise.reject(`${ERRORS.DEPOSIT_FAILED}: what's wrong?`);
    }
  }
}

export async function makeDeposit(
  requestHandler: RequestHandler,
  params: Node.DepositParams
): Promise<boolean> {
  const { networkName, outgoing } = requestHandler;
  const { amount } = params;
  let txhash: string;

  if (networkName == "ont") {
    try {
      txhash = await makeDepositOnt(requestHandler, params);
    } catch(e) {
      outgoing.emit(NODE_EVENTS.DEPOSIT_FAILED, e);
      return false;
    }
  } else {
    try {
      txhash = await makeDepositEth(requestHandler, params);
    } catch(e) {
      outgoing.emit(NODE_EVENTS.DEPOSIT_FAILED, e);
      return false;
    }
  }

  outgoing.emit(NODE_EVENTS.DEPOSIT_STARTED, {
    value: amount,
    txHash: txhash!
  });

  return true;
}

export async function uninstallBalanceRefundApp(
  requestHandler: RequestHandler,
  params: Node.DepositParams
) {
  const {
    publicIdentifier,
    store,
    instructionExecutor,
    networkContext
  } = requestHandler;

  const { ETHBalanceRefund } = networkContext;

  const [peerAddress] = await getPeersAddressFromChannel(
    publicIdentifier,
    store,
    params.multisigAddress
  );

  const stateChannel = await store.getStateChannel(params.multisigAddress);

  const refundApp = stateChannel.getAppInstanceOfKind(ETHBalanceRefund);

  const stateChannelsMap = await instructionExecutor.runUninstallProtocol(
    // https://github.com/counterfactual/monorepo/issues/747
    new Map<string, StateChannel>([
      [stateChannel.multisigAddress, stateChannel]
    ]),
    {
      initiatingXpub: publicIdentifier,
      respondingXpub: peerAddress,
      multisigAddress: stateChannel.multisigAddress,
      appIdentityHash: refundApp.identityHash
    }
  );

  await store.saveStateChannel(
    stateChannelsMap.get(stateChannel.multisigAddress)!
  );
}
