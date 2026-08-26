import type { SignerRequest } from "@slothsign/core";
import type { EvmMethod, EvmTransactionPayload } from "./payload.ts";
import {
  messageToPayload,
  methodToRequestType,
  txToPayload,
  typedDataToPayload,
} from "./payload.ts";

export type EvmNativeRequest =
  | { method: "eth_sendTransaction"; params: [Record<string, unknown>] }
  | { method: "personal_sign"; params: [string, string] }
  | { method: "eth_signTypedData_v4"; params: [string, string] };

/**
 * Convert a native EIP-1193 signing request into the unified SignerRequest.
 */
export function evmRequestToSignerRequest(
  method: EvmMethod,
  params: unknown[],
  chainId: string,
): SignerRequest {
  let address: string;
  let payload: string;

  switch (method) {
    case "eth_sendTransaction": {
      const tx = params[0];
      if (typeof tx !== "object" || tx === null)
        throw new Error("Invalid eth_sendTransaction params");
      const record = tx as EvmTransactionPayload;
      if (typeof record.from !== "string") throw new Error("eth_sendTransaction missing from");
      address = record.from;
      payload = txToPayload(record);
      break;
    }
    case "personal_sign": {
      const [data, addr] = params;
      if (typeof data !== "string" || typeof addr !== "string") {
        throw new Error("Invalid personal_sign params");
      }
      address = addr;
      payload = messageToPayload(data, addr);
      break;
    }
    case "eth_signTypedData_v4": {
      const [addr, typedDataJson] = params;
      if (typeof addr !== "string" || typeof typedDataJson !== "string") {
        throw new Error("Invalid eth_signTypedData_v4 params");
      }
      let typedData: Record<string, unknown>;
      try {
        typedData = JSON.parse(typedDataJson);
      } catch {
        throw new Error("Invalid eth_signTypedData_v4 JSON");
      }
      address = addr;
      payload = typedDataToPayload(addr, typedData);
      break;
    }
  }

  return {
    version: 1,
    chain: "ethereum",
    chainId,
    address,
    type: methodToRequestType(method),
    payload,
  };
}

/**
 * Convert a SignerRequest back into a native EIP-1193 request (for replay/display).
 */
export function signerRequestToEvmRequest(request: SignerRequest): EvmNativeRequest {
  if (request.chain !== "ethereum") throw new Error("Not an EVM request");
  const { payload } = request;
  switch (request.type) {
    case "transaction": {
      const tx = JSON.parse(payload) as Record<string, unknown>;
      return { method: "eth_sendTransaction", params: [tx] };
    }
    case "message": {
      const { message, address } = JSON.parse(payload) as { message: string; address: string };
      return { method: "personal_sign", params: [message, address] };
    }
    case "typedData": {
      const { address, typedData } = JSON.parse(payload) as {
        address: string;
        typedData: Record<string, unknown>;
      };
      return { method: "eth_signTypedData_v4", params: [address, JSON.stringify(typedData)] };
    }
  }
}
