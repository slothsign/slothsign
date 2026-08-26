import { ICON, bridgeRequest, type WindowNotification } from "./shared";

type Listener = (...args: unknown[]) => void;

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: Listener): void;
  removeListener(event: string, listener: Listener): void;
}

let emitEvmEvent: (event: string, ...args: unknown[]) => void = () => undefined;

function createEvmProvider(): Eip1193Provider {
  const listeners = new Map<string, Set<Listener>>();

  emitEvmEvent = (event, ...args) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };

  return {
    async request({ method, params = [] }) {
      switch (method) {
        case "eth_requestAccounts":
          return bridgeRequest<string[]>("connect", "ethereum");
        case "eth_accounts": {
          const accounts = await bridgeRequest<string[]>("accounts", "ethereum");
          return accounts;
        }
        case "eth_chainId":
          return bridgeRequest<string>("chainId", "ethereum");
        case "wallet_switchEthereumChain": {
          const target = (params[0] as { chainId?: unknown } | undefined)?.chainId;
          if (typeof target !== "string") {
            throw { code: -32602, message: "SlothSign: invalid params, expected { chainId }" };
          }
          const chainId = await bridgeRequest<string>("switchChain", "ethereum", undefined, [
            { chainId: target },
          ]);
          emitEvmEvent("chainChanged", chainId);
          return null;
        }
        case "wallet_requestPermissions":
          await bridgeRequest("connect", "ethereum");
          return [{ parentCapability: "eth_accounts", caveats: [] }];
        case "wallet_getPermissions": {
          const accounts = await bridgeRequest<string[]>("accounts", "ethereum");
          return accounts.length > 0 ? [{ parentCapability: "eth_accounts", caveats: [] }] : [];
        }
        case "eth_sendTransaction":
        case "personal_sign":
        case "eth_signTypedData_v4":
          return bridgeRequest("sign", "ethereum", method, params);
        case "wallet_revokePermissions":
          await bridgeRequest("disconnect", "ethereum");
          return [{ eth_accounts: {} }];
        case "net_version": {
          const chainId = await bridgeRequest<string>("chainId", "ethereum");
          return String(parseInt(chainId, 16));
        }
        case "eth_coinbase": {
          const accounts = await bridgeRequest<string[]>("accounts", "ethereum");
          return accounts[0] ?? null;
        }
        case "eth_blockNumber":
        case "eth_gasPrice":
        case "eth_maxPriorityFeePerGas":
        case "eth_feeHistory":
        case "eth_getBalance":
        case "eth_getTransactionCount":
        case "eth_getCode":
        case "eth_getStorageAt":
        case "eth_call":
        case "eth_estimateGas":
        case "eth_getBlockByNumber":
        case "eth_getBlockByHash":
        case "eth_getBlockTransactionCountByNumber":
        case "eth_getBlockTransactionCountByHash":
        case "eth_getUncleCountByBlockNumber":
        case "eth_getUncleCountByBlockHash":
        case "eth_getTransactionByHash":
        case "eth_getTransactionByBlockHashAndIndex":
        case "eth_getTransactionByBlockNumberAndIndex":
        case "eth_getTransactionReceipt":
        case "eth_getLogs":
        case "eth_getProof":
        case "eth_syncing":
        case "eth_protocolVersion":
        case "eth_sendRawTransaction":
        case "web3_clientVersion":
          return bridgeRequest("rpc", "ethereum", method, params);
        default:
          throw { code: 4200, message: `SlothSign: unsupported method ${method}` };
      }
    },
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
  };
}

export function announceEvmProvider(): void {
  const provider = createEvmProvider();
  const info = {
    uuid: crypto.randomUUID(),
    name: "SlothSign",
    icon: ICON,
    rdns: "dev.bananatree.sloth",
  };
  const announce = () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info, provider }),
      }),
    );
  };
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

export function handleNotification({ type, chainId }: WindowNotification): void {
  switch (type) {
    case "chainChanged":
      emitEvmEvent("chainChanged", chainId);
      break;
    case "disconnected":
      emitEvmEvent("disconnect", [{ code: 4900, message: "Disconnected" }]);
      break;
    case "accountsChanged":
      break;
  }
}
