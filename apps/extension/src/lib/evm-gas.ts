import { payloadToTx } from "@slothsign/chain-evm";
import type { EvmGasState, SignPendingRequest } from "./requests.ts";

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

/** The effective gas limit on a raw eth_sendTransaction params object. */
export function gasLimitOf(tx: Record<string, unknown>): string | undefined {
  const gas = typeof tx.gas === "string" && tx.gas ? tx.gas : undefined;
  const limit = typeof tx.gasLimit === "string" && tx.gasLimit ? tx.gasLimit : undefined;
  return gas ?? limit;
}

/**
 * Gas state for a freshly received EVM transaction: dApp-supplied, or flagged
 * for estimation. The value is only written into the payload once an estimate
 * succeeds, so a dApp-supplied limit is never overwritten automatically.
 */
export function evmGasStateFor(params: unknown[]): EvmGasState {
  const tx = params[0];
  if (typeof tx === "object" && tx !== null && gasLimitOf(tx as Record<string, unknown>)) {
    return { source: "dapp" };
  }
  return { source: "estimated", fetching: true };
}
