import { IMessagingService, IStoreService } from "@counterfactual/node";
import { NetworkContext, Node as NodeTypes } from "@counterfactual/types";
//import { RestClient} from "ontology-ts-sdk";
//import { CONST, RestClient } from "ontology-ts-sdk";
//import { Ont as ontologyTsSdk } from "@counterfactual/browser";

// This is a mimic type declaration of the Node, used locally to prevent
// Stencil from blowing up due to "member not exported" errors.
// It's derived from `node.d.ts`.
export declare class Node {
  static create(
    messagingService: IMessagingService,
    storeService: IStoreService,
    nodeConfig: NodeConfig,
    // @ts-ignore
    provider: ethers.providers.Provider,
    ontclient: RestClient,
    network: string,
    networkContext?: NetworkContext
  ): Promise<Node>;
  readonly publicIdentifier: string;
  on(event: string, callback: (res: any) => void): void;
  once(event: string, callback: (res: any) => void): void;
  off(event: string, callback?: (res: any) => void): void;
  emit(event: string, req: NodeTypes.MethodRequest): void;
  call(
    method: NodeTypes.MethodName,
    req: NodeTypes.MethodRequest
  ): Promise<NodeTypes.MethodResponse>;
}

declare class RestClient {
  constructor(url ?: string);
}

export interface NodeConfig {
  STORE_KEY_PREFIX: string;
}

export default class CounterfactualNode {
  private static node: Node;

  static getInstance(): Node {
    return CounterfactualNode.node;
  }

  static async create(settings: {
    messagingService: IMessagingService;
    storeService: IStoreService;
    nodeConfig: { STORE_KEY_PREFIX: string };
    network: string;
    networkContext?: NetworkContext;
  }): Promise<Node> {
    if (CounterfactualNode.node) {
      return CounterfactualNode.node;
    }

    CounterfactualNode.node = await Node.create(
      settings.messagingService,
      settings.storeService,
      settings.nodeConfig,
      new ethers.providers.Web3Provider(window["web3"].currentProvider),
      false,
      //new RestClient('http://polaris1.ont.io:2-335'),
      //new RestClient('http://polaris1.ont.io:2-335'),
      settings.network
    );

    return CounterfactualNode.getInstance();
  }
}
