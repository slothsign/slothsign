import type { AccountRef } from "./account.ts";

export type RequestType = "transaction" | "message" | "typedData";

/**
 * Unified cross-chain signing request envelope.
 * Chain adapters convert native requests to / from this shape.
 */
export interface SignerRequest extends AccountRef {
  version: 1;
  chainId: string;
  type: RequestType;
  /** chain-specific, opaque payload (base64 for binary, JSON string for structured) */
  payload: string;
}

export function isSignerRequest(value: unknown): value is SignerRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    (v.chain === "ethereum" || v.chain === "solana") &&
    typeof v.chainId === "string" &&
    typeof v.address === "string" &&
    (v.type === "transaction" || v.type === "message" || v.type === "typedData") &&
    typeof v.payload === "string"
  );
}
