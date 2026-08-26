import type { SignerRequest } from "@slothsign/core";
import { base64ToBytes, bytesToBase64, type SolanaMessagePayload } from "./payload.ts";

export type SolanaMethod = "signTransaction" | "signMessage";

/**
 * Build a SignerRequest from a wallet-standard Solana signing input.
 */
export function solanaRequestToSignerRequest(
  method: SolanaMethod,
  input: { transaction?: Uint8Array; message?: Uint8Array; publicKey: string },
  chainId = "solana",
): SignerRequest {
  switch (method) {
    case "signTransaction": {
      if (!input.transaction) throw new Error("signTransaction missing transaction");
      return {
        version: 1,
        chain: "solana",
        chainId,
        address: input.publicKey,
        type: "transaction",
        payload: bytesToBase64(input.transaction),
      };
    }
    case "signMessage": {
      if (!input.message) throw new Error("signMessage missing message");
      const payload: SolanaMessagePayload = {
        message: bytesToBase64(input.message),
        publicKey: input.publicKey,
      };
      return {
        version: 1,
        chain: "solana",
        chainId,
        address: input.publicKey,
        type: "message",
        payload: JSON.stringify(payload),
      };
    }
  }
}

export function payloadToTransactionBytes(payload: string): Uint8Array {
  return base64ToBytes(payload);
}

export function payloadToMessage(payload: string): SolanaMessagePayload {
  const parsed = JSON.parse(payload) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as SolanaMessagePayload).message !== "string" ||
    typeof (parsed as SolanaMessagePayload).publicKey !== "string"
  ) {
    throw new Error("Invalid Solana message payload");
  }
  return parsed as SolanaMessagePayload;
}
