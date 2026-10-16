import type { Chain, SignerRequest } from "@slothsign/core";
import type { SignerMode } from "./types.ts";

export type RequestStatus = "pending" | "resolved" | "rejected" | "cancelled";

interface PendingRequestBase {
  id: string;
  chain: Chain;
  origin: string;
  status: RequestStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Provenance and progress of an EVM transaction's gas limit. The value itself
 * lives in `signerRequest.payload`; this only tracks where it came from and
 * whether an estimate is in flight or last failed.
 */
export interface EvmGasState {
  source: "dapp" | "estimated";
  fetching?: boolean;
  error?: string;
}

export interface SignPendingRequest extends PendingRequestBase {
  kind: "sign";
  address: string;
  method: string;
  params: unknown[];
  signer: SignerMode;
  signerRequest?: SignerRequest;
  /** sloth://req/… transport string (offline mode) */
  transport?: string;
  /** EVM gas-limit state (eth_sendTransaction only) */
  gas?: EvmGasState;
}

export interface ConnectPendingRequest extends PendingRequestBase {
  kind: "connect";
  method: string;
  accounts: string[];
}

export type PendingRequest = SignPendingRequest | ConnectPendingRequest;

export const REQUEST_TTL_MS = 15 * 60 * 1000;

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface RequestPatch {
  status?: RequestStatus;
  result?: unknown;
  error?: string;
  signerRequest?: SignerRequest;
  transport?: string;
  gas?: EvmGasState;
}
