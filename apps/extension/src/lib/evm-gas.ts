import { payloadToTx } from "@slothsign/chain-evm";
import type { SignPendingRequest } from "./requests.ts";

export interface EvmGasInfo {
  /** The request is an EVM transaction, so a gas limit is relevant. */
  applicable: boolean;
  /** An estimate is currently in flight. */
  fetching: boolean;
  /** The effective gas limit (hex) carried by the payload, if any. */
  value?: string;
  /** Whether the value came from an estimate rather than the dApp. */
  estimated: boolean;
  /** The last estimation failure, if any. */
  error?: string;
}

/** Read the gas-limit state and value for a signing request. */
export function evmGasInfo(request: SignPendingRequest): EvmGasInfo {
  if (request.chain !== "ethereum" || request.signerRequest?.type !== "transaction") {
    return { applicable: false, fetching: false, estimated: false };
  }
  let value: string | undefined;
  try {
    const tx = payloadToTx(request.signerRequest.payload);
    value = tx.gas ?? tx.gasLimit;
  } catch {
    value = undefined;
  }
  return {
    applicable: true,
    fetching: request.gas?.fetching ?? false,
    value,
    estimated: request.gas?.source === "estimated" && Boolean(value),
    error: request.gas?.error,
  };
}

/** Whether signing may proceed: a gas limit is present and not being refetched. */
export function gasReady(info: EvmGasInfo): boolean {
  if (!info.applicable) return true;
  return Boolean(info.value) && !info.fetching;
}

/** Human-readable reason signing is blocked, or undefined when it is allowed. */
export function gasBlockedReason(info: EvmGasInfo): string | undefined {
  if (gasReady(info)) return undefined;
  if (info.fetching) return "Estimating gas…";
  return info.error ? `Gas estimate failed: ${info.error}` : "Gas limit unavailable";
}
