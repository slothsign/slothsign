import { encodeRequest } from "@slothsign/core";
import { numField, payloadToTx, txToPayload } from "@slothsign/chain-evm";
import { createPublicClient, http, toHex, type Address, type Hex } from "viem";
import { getEvmChain, getEvmRpcUrl } from "../lib/evmChains.ts";
import { readableError } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import type { RequestPatch, SignPendingRequest } from "../lib/requests.ts";
import { getRequest, updateRequest } from "./request-store.ts";
import { readRpcUrls } from "./storage.ts";

/**
 * Estimate the gas limit for a pending EVM transaction against the chain's RPC.
 * Throws when no RPC is configured or the node rejects the estimate.
 */
export async function estimateEvmGas(request: SignPendingRequest): Promise<string> {
  const signerRequest = request.signerRequest;
  if (signerRequest?.type !== "transaction") {
    throw new Error("Not an EVM transaction request");
  }
  const chain = getEvmChain(signerRequest.chainId);
  const rpcUrls = await readRpcUrls();
  const url = chain ? getEvmRpcUrl(chain, rpcUrls) : undefined;
  if (!chain || !url) throw new Error("no RPC endpoint for this chain");
  const tx = payloadToTx(signerRequest.payload);
  const client = createPublicClient({ chain, transport: http(url) });
  const gas = await client.estimateGas({
    account: request.address as Address,
    to: tx.to as Address | undefined,
    value: numField(tx.value),
    data: tx.data as Hex | undefined,
  });
  return toHex(gas);
}

/**
 * Write an estimated gas limit into the stored request, refreshing the QR
 * transport so an already-rendered code cannot be signed against stale gas.
 */
async function applyEvmGas(request: SignPendingRequest, gas: string): Promise<void> {
  const signerRequest = request.signerRequest;
  if (signerRequest?.type !== "transaction") return;
  const tx = payloadToTx(signerRequest.payload);
  const nextRequest = { ...signerRequest, payload: txToPayload({ ...tx, gas }) };
  const patch: RequestPatch = {
    signerRequest: nextRequest,
    gas: { source: "estimated", fetching: false },
  };
  if (request.signer === "keystone-qr" || request.signer === "address-qr") {
    patch.transport = encodeRequest(nextRequest);
  }
  await updateRequest(request.id, patch);
}

/**
 * (Re-)estimate the gas limit for a pending EVM transaction. Runs for the
 * initial estimate on arrival and for the popup's refresh action. The estimator
 * is injectable so the state transitions can be tested without an RPC.
 */
export async function refreshEvmGas(
  id: string,
  estimate: (request: SignPendingRequest) => Promise<string> = estimateEvmGas,
): Promise<{ ok: boolean; error?: string }> {
  const request = await getRequest(id);
  if (!request || request.kind !== "sign" || request.chain !== "ethereum") {
    return { ok: false, error: "Request not found" };
  }
  if (request.signerRequest?.type !== "transaction") {
    return { ok: false, error: "Not an EVM transaction request" };
  }
  const source = request.gas?.source ?? "estimated";
  await updateRequest(id, { gas: { source, fetching: true } });
  try {
    const gas = await estimate(request);
    const current = await getRequest(id);
    if (!current || current.kind !== "sign" || current.status !== "pending") {
      return { ok: true };
    }
    await applyEvmGas(current, gas);
    return { ok: true };
  } catch (error) {
    log?.error(`gas estimation failed for ${id}:`, error);
    const message = readableError(error);
    await updateRequest(id, { gas: { source, fetching: false, error: message } });
    return { ok: false, error: message };
  }
}
