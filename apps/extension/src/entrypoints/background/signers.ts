import { evmRequestToSignerRequest, type EvmMethod } from "@slothsign/chain-evm";
import {
  base64ToBytes,
  solanaRequestToSignerRequest,
  type SolanaMethod,
} from "@slothsign/chain-solana";
import type { SignerRequest } from "@slothsign/core";
import type { PendingRequest } from "../../lib/requestStore.ts";

export type DispatchResult = { ok: true; request: PendingRequest } | { ok: false; error: string };

/**
 * Resolve the signing address for a native request.
 */
export function resolveAddress(
  chain: "ethereum" | "solana",
  method: string,
  params: unknown[],
): string | undefined {
  if (chain === "ethereum") {
    switch (method as EvmMethod) {
      case "eth_sendTransaction": {
        const tx = params[0] as { from?: unknown } | undefined;
        return typeof tx?.from === "string" ? tx.from : undefined;
      }
      case "personal_sign":
        return typeof params[1] === "string" ? params[1] : undefined;
      case "eth_signTypedData_v4":
        return typeof params[0] === "string" ? params[0] : undefined;
      default:
        return undefined;
    }
  }
  if (chain === "solana") {
    return typeof params[0] === "string" ? params[0] : undefined;
  }
  return undefined;
}

/**
 * Build the unified SignerRequest from a native request.
 */
export function buildSignerRequest(
  chain: "ethereum" | "solana",
  method: string,
  params: unknown[],
  chainId: string,
): SignerRequest {
  if (chain === "ethereum") {
    return evmRequestToSignerRequest(method as EvmMethod, params, chainId);
  }
  if (chain === "solana") {
    const publicKey = params[0];
    if (typeof publicKey !== "string") throw new Error("Solana request missing public key");
    const input = params[1] as { transaction?: string; message?: string } | undefined;
    if (method === "signTransaction" || method === "signAndSendTransaction") {
      if (typeof input?.transaction !== "string") throw new Error(`${method} missing transaction`);
      return solanaRequestToSignerRequest("signTransaction", {
        publicKey,
        transaction: base64ToBytes(input.transaction),
      });
    }
    if (method === "signMessage") {
      if (typeof input?.message !== "string") throw new Error("signMessage missing message");
      return solanaRequestToSignerRequest(method as SolanaMethod, {
        publicKey,
        message: base64ToBytes(input.message),
      });
    }
    throw new Error(`Unsupported Solana method: ${method}`);
  }
  throw new Error(`Unsupported chain: ${chain}`);
}
