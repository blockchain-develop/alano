import { xkeyKthAddress } from "@counterfactual/machine";
import { Node } from "@counterfactual/types";
import { JsonRpcProvider, TransactionResponse } from "ethers/providers";
import { Parameter, ParameterType, utils, Crypto, TransactionBuilder } from "ontology-ts-sdk";
import { client } from "ontology-dapi";
import Queue from "p-queue";

import { RequestHandler } from "../../../request-handler";
import { NODE_EVENTS } from "../../../types";
import { NodeController } from "../../controller";
import { ERRORS } from "../../errors";

import { runWithdrawProtocol } from "./operation";
import { HashZero } from "ethers/constants";

export default class WithdrawController extends NodeController {
  public static readonly methodName = Node.MethodName.WITHDRAW;

  protected async enqueueByShard(
    requestHandler: RequestHandler,
    params: Node.DepositParams
  ): Promise<Queue[]> {
    return [requestHandler.getShardedQueue(params.multisigAddress)];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: Node.DepositParams
  ): Promise<void> {
    const { store, networkContext } = requestHandler;
    const { multisigAddress } = params;

    const channel = await store.getStateChannel(multisigAddress);

    if (channel.hasAppInstanceOfKind(networkContext.ETHBalanceRefund)) {
      return Promise.reject(ERRORS.CANNOT_WITHDRAW);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.WithdrawParams
  ): Promise<Node.WithdrawResult> {
    const {
      store,
      publicIdentifier,
      networkName,
    } = requestHandler;
    const { multisigAddress, amount, recipient } = params;
    params.recipient = recipient || xkeyKthAddress(publicIdentifier, 0);

    await runWithdrawProtocol(requestHandler, params);

    const commitment = await store.getWithdrawalCommitment(multisigAddress);
    if (!commitment) {
      throw Error("no commitment found");
    }

    if (networkName == "ont") {
      try {
        const txhash = await this.withdrawOnt(requestHandler, commitment);
        requestHandler.outgoing.emit(NODE_EVENTS.WITHDRAWAL_STARTED, {
          value: amount,
          txHash: txhash
        });
      } catch(e) {
        requestHandler.outgoing.emit(NODE_EVENTS.WITHDRAWAL_FAILED, e);
        throw e;
      }
    } else {
      try {
        const txhash = await this.withdrawEth(requestHandler, commitment);
        requestHandler.outgoing.emit(NODE_EVENTS.WITHDRAWAL_STARTED, {
          value: amount,
          txHash: txhash
        });
      } catch(e) {
        requestHandler.outgoing.emit(NODE_EVENTS.WITHDRAWAL_FAILED, e);
        throw e;
      }
    }

    return {
      amount,
      recipient: params.recipient
    };
  }

  private async withdrawEth(
    requestHandler: RequestHandler,
    commitment: any
  ): Promise<string> {
    const {
      provider,
      wallet,
      blocksNeededForConfirmation
    } = requestHandler;

    const tx = {
      ...commitment,
      gasPrice: await provider.getGasPrice(),
      gasLimit: 300000
    };

    let txhash: string;
    try {
      let txResponse: TransactionResponse;

      if (provider instanceof JsonRpcProvider) {
        const signer = await provider.getSigner();
        txResponse = await signer.sendTransaction(tx);
      } else {
        txResponse = await wallet.sendTransaction(tx);
      }
      txhash = txResponse.hash!;
      await provider.waitForTransaction(
        txResponse.hash as string,
        blocksNeededForConfirmation
      );
    } catch (e) {
      throw new Error(`${ERRORS.WITHDRAWAL_FAILED}: ${e}`);
    }
    return txhash;
  }

  private async withdrawOnt(
    requestHandler: RequestHandler,
    commitment: any
  ): Promise<string> {
    const {
      ontclient,
      ontaccount,
      networkContext,
    } = requestHandler;

    const signer = await requestHandler.getOntSigner();
    if (signer == 1) {
      const scriptHash = networkContext.StateChannelTransaction;
      const operation = utils.str2hexstr("withdraw");
      //const p1 = new DParameter('from', DParameterType.string, multisigAddress);
      //const p2 = new DParameter('from', DParameterType.Int, amount);
      //const args : DParameter[] = [{type: 'string', value: multisigAddress}, {type: {'int'}, value: amount}];
      //const args;
      //const response = await client.api.smartContract.invoke({scriptHash, operation, args, 500, 200000});
      const response = await client.api.smartContract.invoke({scriptHash, operation});
      console.log("ontology withdraw response: " + JSON.stringify(response));
  
      //const notifys = response.Result.Notify;
      const txhash = response.transaction;
      return txhash;
    } else {
      const p1 = new Parameter('from', ParameterType.String, commitment);
      const contractAddr = new Crypto.Address(utils.reverseHex(networkContext.StateChannelTransaction));
      const tx = TransactionBuilder.makeInvokeTransaction(utils.str2hexstr("withdraw"), [p1], contractAddr, '500', '200000', ontaccount.address);
      TransactionBuilder.signTransaction(tx, ontaccount.exportPrivateKey("password"));
      const response = await ontclient.sendRawTransaction(tx.serialize(), true);
      console.log("ontology withdraw response: " + JSON.stringify(response));
  
      //const notifys = response.Result.Notify;
      const state = response.Result.State;
      if (state == 1) {
        /*
        for (const notify of notifys) {
          if (notify.ContractAddress == networkContext.StateChannelTransaction) {
            const event = notify.States;
            if (event[0] == utils.str2hexstr("withdraw")) {
              return event[1];
            }
          }
        }
        */
        return HashZero;
      } else {
        return Promise.reject(`${ERRORS.WITHDRAWAL_FAILED}: what's wrong?`);
      }
    }
  }
}
