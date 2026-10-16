import browser from "webextension-polyfill";
import { decodeResult, encodeRequest } from "@slothsign/core";
import { numField, payloadToTx, txToPayload } from "@slothsign/chain-evm";
import {
  base64ToBytes,
  broadcastTransaction,
  bytesToBase64,
  extractSignature,
  payloadToTransactionBytes,
  signTransactionWithDetachedSignature,
  type SolanaBroadcastOptions,
} from "@slothsign/chain-solana";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseSignature,
  serializeTransaction,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { JsonRpcResponseSchema, RuntimeMessageSchema } from "../../lib/messages.ts";
import { evmSerializable } from "../../lib/keystone.ts";
import {
  updateRequest,
  type EvmGasState,
  type RequestPatch,
  type SignPendingRequest,
} from "../../lib/requestStore.ts";
import {
  isOriginConnected,
  markOriginConnected,
  normalizeWallet,
  parseActiveWallets,
  parseStoredWallets,
  readActiveWallets,
  readConnectedOrigins,
  readEvmChainId,
  readRpcUrls,
  readStoredWallets,
  reconcileActiveWallets,
  resolveActiveWallets,
  unmarkOriginConnected,
  validateWallet,
  writeActiveWallets,
  writeEvmChainId,
  writeStoredWallets,
  SOLANA_RPC_KEY,
  type ActiveWallets,
  type WalletConfig,
} from "../../lib/config.ts";
import { chainIdToHex, getEvmChain, getEvmRpcUrl } from "../../lib/evmChains.ts";
import { extractOrigin } from "../../lib/origin.ts";
import {
  awaitResolution,
  confirmConnectRequest,
  createConnectRequest,
  createPendingRequest,
  getRequest,
  listPendingRequests,
  rejectRequest,
  resolveRequest,
  showNextRequest,
} from "./requestManager.ts";
import { signEvmWithTrezor, signSolanaWithTrezor, getTrezorXpub } from "./trezor.ts";
import { log } from "../../lib/log.ts";

log?.debug("background service worker started");

function accountsFromWallets(
  wallets: WalletConfig[],
  active: ActiveWallets,
  chain: "ethereum" | "solana",
): string[] {
  const resolved = resolveActiveWallets(wallets, active);
  const activeId = resolved[chain];
  const activeWallet = activeId
    ? wallets.find((w) => w.chain === chain && w.id === activeId)
    : undefined;
  if (activeWallet) return [activeWallet.address];
  return wallets.filter((w) => w.chain === chain).map((w) => w.address);
}

async function accountsForChain(chain: "ethereum" | "solana"): Promise<string[]> {
  const wallets = await readStoredWallets();
  const active = await readActiveWallets();
  return accountsFromWallets(wallets, active, chain);
}

/**
 * Resolve the origin of the dApp page currently in use, skipping extension
 * windows such as the signing popup (which steals focus from the browser).
 */
async function getActivePageOrigin(): Promise<string | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.url && !tab.url.startsWith(browser.runtime.getURL("/"))) {
    return extractOrigin(tab.url);
  }
  const [normalTab] = await browser.tabs.query({ active: true, windowType: "normal" });
  return normalTab?.url ? extractOrigin(normalTab.url) : undefined;
}

/**
 * Resolve a submitted signature into the value the dApp should receive.
 * For EVM transactions the raw signature is reassembled into a signed raw
 * transaction and broadcast on-chain, returning the real tx hash. For Solana
 * keystone-qr transactions the detached 64-byte signature is injected back
 * into the original serialized transaction, returning the signed tx bytes.
 */
async function finalizeSignature(request: SignPendingRequest, result: unknown): Promise<unknown> {
  if (request.chain === "solana" && request.method === "signAndSendTransaction") {
    if (request.signerRequest?.type !== "transaction")
      throw new Error("SlothSign: invalid transaction request");
    if (typeof result !== "string") throw new Error("SlothSign: invalid transaction signature");
    const serialized = payloadToTransactionBytes(request.signerRequest.payload);
    const signed =
      request.signer === "keystone-qr"
        ? signTransactionWithDetachedSignature(serialized, base64ToBytes(result), request.address)
        : base64ToBytes(result);
    const rpcUrls = await readRpcUrls();
    const rpcUrl = rpcUrls[SOLANA_RPC_KEY];
    if (!rpcUrl) throw new Error("SlothSign: no custom Solana RPC endpoint configured");
    const signature = extractSignature(signed);
    await broadcastTransaction(rpcUrl, signed, readSolanaSendOptions(request.params));
    return bytesToBase64(signature);
  }
  if (request.chain === "solana" && request.signer === "keystone-qr") {
    if (request.signerRequest?.type !== "transaction") return result;
    if (typeof result !== "string") throw new Error("SlothSign: invalid transaction signature");
    const serialized = payloadToTransactionBytes(request.signerRequest.payload);
    const signed = signTransactionWithDetachedSignature(
      serialized,
      base64ToBytes(result),
      request.address,
    );
    return bytesToBase64(signed);
  }
  if (
    request.chain !== "ethereum" ||
    request.method !== "eth_sendTransaction" ||
    request.signerRequest?.type !== "transaction"
  ) {
    return result;
  }
  if (typeof result !== "string" || !result.startsWith("0x")) {
    throw new Error("SlothSign: invalid transaction signature");
  }
  const { chainId, payload } = request.signerRequest;
  const chain = getEvmChain(chainId);
  if (!chain) {
    log?.error("finalizeSignature: no chain for", chainId);
    throw new Error("SlothSign: no RPC endpoint for this chain");
  }
  const rpcUrls = await readRpcUrls();
  const url = getEvmRpcUrl(chain, rpcUrls);
  if (!url) {
    log?.error("finalizeSignature: no RPC URL for", chain.name);
    throw new Error("SlothSign: no RPC endpoint for this chain");
  }

  const tx = payloadToTx(payload);
  const signature = parseSignature(result as Hex);
  const raw = serializeTransaction(evmSerializable(tx, chainId), signature);

  const client = createWalletClient({ chain, transport: http(url) });
  return client.sendRawTransaction({ serializedTransaction: raw });
}

/**
 * Fill missing nonce and gas fees on an eth_sendTransaction request before it
 * is shown to the signer, so the signature is produced with the correct nonce.
 */
async function prepareEvmTxParams(params: unknown[], chainId: string): Promise<unknown[]> {
  const tx = params[0];
  if (typeof tx !== "object" || tx === null) return params;
  const record = tx as Record<string, unknown>;
  if (typeof record.from !== "string" || (record.nonce && record.gasPrice)) {
    return params;
  }
  const chain = getEvmChain(chainId);
  const rpcUrls = await readRpcUrls();
  const url = chain ? getEvmRpcUrl(chain, rpcUrls) : undefined;
  if (!url) return params;
  const client = createPublicClient({ chain, transport: http(url) });
  const next = { ...record };
  try {
    if (!next.nonce) {
      const nonce = await client.getTransactionCount({
        address: record.from as `0x${string}`,
        blockTag: "pending",
      });
      next.nonce = toHex(nonce);
    }
    if (!next.gasPrice && !next.maxFeePerGas) {
      const fees = await client.estimateFeesPerGas();
      if (fees.maxFeePerGas !== undefined) {
        next.maxFeePerGas = toHex(fees.maxFeePerGas);
        next.maxPriorityFeePerGas = toHex(fees.maxPriorityFeePerGas);
      } else if (fees.gasPrice !== undefined) {
        next.gasPrice = toHex(fees.gasPrice);
      }
    }
  } catch (e) {
    log?.error("prepareEvmTxParams failed:", e);
    return params;
  }
  return [next, ...params.slice(1)];
}

/** The effective gas limit on a raw eth_sendTransaction params object. */
function gasLimitOf(tx: Record<string, unknown>): string | undefined {
  const gas = typeof tx.gas === "string" && tx.gas ? tx.gas : undefined;
  const limit = typeof tx.gasLimit === "string" && tx.gasLimit ? tx.gasLimit : undefined;
  return gas ?? limit;
}

/**
 * Gas state for a freshly received EVM transaction: dApp-supplied, or flagged
 * for estimation. The value is only written into the payload once an estimate
 * succeeds, so a dApp-supplied limit is never overwritten automatically.
 */
function evmGasStateFor(params: unknown[]): EvmGasState {
  const tx = params[0];
  if (typeof tx === "object" && tx !== null && gasLimitOf(tx as Record<string, unknown>)) {
    return { source: "dapp" };
  }
  return { source: "estimated", fetching: true };
}

/**
 * Estimate the gas limit for a pending EVM transaction against the chain's RPC.
 * Throws when no RPC is configured or the node rejects the estimate.
 */
async function estimateEvmGas(request: SignPendingRequest): Promise<string> {
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
 * initial estimate on arrival and for the popup's refresh action.
 */
async function refreshEvmGas(id: string): Promise<{ ok: boolean; error?: string }> {
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
    const gas = await estimateEvmGas(request);
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

function readSolanaSendOptions(params: unknown[]): SolanaBroadcastOptions | undefined {
  const input = params[1] as { options?: Record<string, unknown> } | undefined;
  const options = input?.options;
  if (typeof options !== "object" || options === null) return undefined;
  const commitment = options.commitment ?? options.preflightCommitment;
  return {
    ...(typeof commitment === "string"
      ? { commitment: commitment as SolanaBroadcastOptions["commitment"] }
      : {}),
    ...(typeof options.skipPreflight === "boolean" ? { skipPreflight: options.skipPreflight } : {}),
    ...(typeof options.maxRetries === "number" ? { maxRetries: options.maxRetries } : {}),
  };
}

function readableError(error: unknown): string {
  if (error instanceof Error) {
    const msg =
      "shortMessage" in error
        ? String((error as Record<string, unknown>).shortMessage)
        : error.message;
    return msg.replace(/^SlothSign: /, "");
  }
  return String(error);
}

/**
 * Push the current accounts for a chain to every tab whose origin is connected,
 * but only when the accounts actually changed. The before/after states come
 * from the storage change event (which carries persisted oldValue/newValue), so
 * the diff is correct across service-worker restarts with no extra state.
 */
async function broadcastAccountsChanged(
  chain: "ethereum" | "solana",
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
): Promise<void> {
  const wallets = await readStoredWallets();
  const active = await readActiveWallets();
  const accounts = accountsFromWallets(wallets, active, chain);
  const before = accountsFromWallets(
    changes.wallets ? parseStoredWallets(changes.wallets.oldValue ?? []) : wallets,
    changes.activeWallets ? parseActiveWallets(changes.activeWallets.oldValue ?? {}) : active,
    chain,
  );
  if (sameAccounts(before, accounts)) return;
  const origins = await readConnectedOrigins();
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    const origin = extractOrigin(tab.url);
    if (!isOriginConnected(origins, chain, origin)) continue;
    await browser.tabs
      .sendMessage(tab.id, { type: "accounts-changed-notify", chain, accounts })
      .catch(() => undefined);
  }
}

function sameAccounts(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Guards against double-clicks opening two concurrent device sessions. */
const trezorSigning = new Set<string>();

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (!changes.wallets && !changes.activeWallets) return;
  await Promise.all([
    broadcastAccountsChanged("ethereum", changes),
    broadcastAccountsChanged("solana", changes),
  ]);
});

// Backup drain: the signer page reports its own closing (signer-closed) with
// its request id; if that notice is ever lost, any tab close re-checks the
// live window state so the queue can never wedge on a phantom entry.
browser.tabs.onRemoved.addListener(() => {
  void showNextRequest();
});

browser.runtime.onMessage.addListener(
  async (raw: unknown, sender: browser.Runtime.MessageSender) => {
    const parsed = RuntimeMessageSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const msg = parsed.data;

    switch (msg.type) {
      case "accounts-request": {
        const origin = extractOrigin(sender.url);
        const origins = await readConnectedOrigins();
        if (!isOriginConnected(origins, msg.chain, origin)) return [];
        return accountsForChain(msg.chain);
      }

      case "connect-request": {
        const origin = extractOrigin(sender.url);
        log?.debug(`connect-request chain=${msg.chain} origin=${origin}`);
        const origins = await readConnectedOrigins();
        const wallets = await readStoredWallets();
        const active = resolveActiveWallets(wallets, await readActiveWallets());
        if (isOriginConnected(origins, msg.chain, origin)) {
          log?.debug(`${origin} already connected, returning accounts`);
          return accountsFromWallets(wallets, active, msg.chain);
        }
        if (!active[msg.chain]) {
          log?.warn(`connect-request: no active ${msg.chain} wallet`);
          throw new Error(`SlothSign: no active ${msg.chain} wallet`);
        }
        const accounts = accountsFromWallets(wallets, active, msg.chain);
        const request = await createConnectRequest({
          chain: msg.chain,
          originUrl: sender.url,
          accounts,
        });
        log?.debug(`connect request ${request.id} pending, awaiting approval`);
        return awaitResolution(request.id);
      }

      case "confirm-connect": {
        try {
          await confirmConnectRequest(msg.id);
          log?.debug(`connect request ${msg.id} approved`);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      }

      case "get-active-tab-connected": {
        const origin = await getActivePageOrigin();
        if (!origin || origin === "unknown") return false;
        const origins = await readConnectedOrigins();
        return isOriginConnected(origins, msg.chain, origin);
      }
      case "disconnect": {
        const origin =
          sender.url && !sender.url.startsWith(browser.runtime.getURL("/"))
            ? extractOrigin(sender.url)
            : await getActivePageOrigin();
        if (!origin || origin === "unknown") return { ok: false };
        await unmarkOriginConnected(msg.chain, origin);
        const tabs = await browser.tabs.query({});
        const target = tabs.find(
          (t) => t.id != null && t.url != null && extractOrigin(t.url) === origin,
        );
        if (target?.id != null) {
          await browser.tabs
            .sendMessage(target.id, { type: "disconnect-notify", chain: msg.chain })
            .catch(() => undefined);
        }
        return { ok: true };
      }
      case "chain-id-request": {
        if (msg.chain === "ethereum") return readEvmChainId();
        return "solana:mainnet";
      }
      case "switch-chain-request": {
        const chain = getEvmChain(msg.chainId);
        if (!chain) {
          return { ok: false, code: 4902, message: "Unrecognized chain ID" };
        }
        const normalized = chainIdToHex(chain.id);
        await writeEvmChainId(normalized);
        const tabs = await browser.tabs.query({});
        const senderTabId = sender.tab?.id;
        for (const tab of tabs) {
          if (tab.id == null || tab.id === senderTabId) continue;
          await browser.tabs
            .sendMessage(tab.id, { type: "chain-changed-notify", chainId: normalized })
            .catch(() => undefined);
        }
        return { ok: true, chainId: normalized };
      }
      case "get-current-chain": {
        const chainId = await readEvmChainId();
        return { chainId, name: getEvmChain(chainId)?.name ?? chainId };
      }
      case "solana-rpc-request": {
        const rpcUrls = await readRpcUrls();
        return { rpcUrl: rpcUrls[SOLANA_RPC_KEY] ?? null };
      }
      case "rpc-request": {
        const chain = getEvmChain(await readEvmChainId());
        const rpcUrls = await readRpcUrls();
        const url = chain ? getEvmRpcUrl(chain, rpcUrls) : undefined;
        if (!url) {
          return {
            ok: false,
            code: -32601,
            message: "SlothSign: no RPC endpoint for the current chain",
          };
        }
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: msg.method,
              params: msg.params,
            }),
          });
          if (!res.ok) {
            log?.error(`RPC ${msg.method} failed: HTTP ${res.status}`);
            return { ok: false, code: -32603, message: `RPC request failed: HTTP ${res.status}` };
          }
          const parsed = JsonRpcResponseSchema.safeParse(await res.json());
          if (!parsed.success) {
            log?.error(`RPC ${msg.method}: invalid response`);
            return { ok: false, code: -32603, message: "Invalid RPC response" };
          }
          if (parsed.data.error) {
            log?.error(`RPC ${msg.method} error:`, parsed.data.error);
            return {
              ok: false,
              code: parsed.data.error.code,
              message: parsed.data.error.message,
              data: parsed.data.error.data,
            };
          }
          return { ok: true, result: parsed.data.result };
        } catch (error) {
          log?.error(`RPC ${msg.method} threw:`, error);
          return {
            ok: false,
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }
      case "sign-request": {
        if (msg.chain === "solana" && msg.method === "signAndSendTransaction") {
          const rpcUrls = await readRpcUrls();
          if (!rpcUrls[SOLANA_RPC_KEY]) {
            throw new Error(
              "SlothSign: no custom Solana RPC endpoint configured; signAndSendTransaction is disabled",
            );
          }
        }
        const chainId = msg.chain === "ethereum" ? await readEvmChainId() : "solana:mainnet";
        const isEvmTx = msg.chain === "ethereum" && msg.method === "eth_sendTransaction";
        const params = isEvmTx ? await prepareEvmTxParams(msg.params, chainId) : msg.params;
        const gas = isEvmTx ? evmGasStateFor(params) : undefined;
        const request = await createPendingRequest({
          chain: msg.chain,
          method: msg.method,
          params,
          originUrl: sender.url,
          chainId,
          gas,
        });
        if (gas?.fetching) void refreshEvmGas(request.id);
        await markOriginConnected(msg.chain, extractOrigin(sender.url));
        return awaitResolution(request.id);
      }

      case "refresh-gas": {
        return refreshEvmGas(msg.id);
      }

      case "submit-signature": {
        const { id, payload } = msg;
        const request = await getRequest(id);
        if (!request || request.kind !== "sign") return { ok: false, error: "Request not found" };
        try {
          const decoded = decodeResult(payload);
          if (decoded.chain !== request.chain) {
            throw new Error(`Signature chain mismatch: expected ${request.chain}`);
          }
          const result = await finalizeSignature(request, decoded.result);
          resolveRequest(id, result);
          return { ok: true };
        } catch (error) {
          log?.error("submit-signature failed:", error);
          rejectRequest(id, readableError(error));
          return { ok: false, error: readableError(error) };
        }
      }

      case "trezor-sign": {
        const { id } = msg;
        if (trezorSigning.has(id)) return { ok: false, error: "Signing already in progress" };
        trezorSigning.add(id);
        try {
          const pending = await getRequest(id);
          if (!pending || pending.kind !== "sign" || pending.status !== "pending") {
            return { ok: false, error: "Request not found" };
          }
          if (pending.signer !== "trezor") return { ok: false, error: "Not a Trezor request" };
          if (
            pending.chain === "solana" &&
            pending.method === "signAndSendTransaction" &&
            !(await readRpcUrls())[SOLANA_RPC_KEY]
          ) {
            // Fail before the device prompt: broadcasting needs a custom RPC.
            return {
              ok: false,
              error: "No custom Solana RPC endpoint configured; signAndSendTransaction is disabled",
            };
          }
          const wallets = await readStoredWallets();
          const wallet = wallets.find(
            (w) =>
              w.chain === pending.chain &&
              w.address.toLowerCase() === pending.address.toLowerCase(),
          );
          // Keep the service worker alive while the user confirms on the device.
          const keepAlive = setInterval(() => {
            void browser.runtime.getPlatformInfo().catch(() => undefined);
          }, 20_000);
          let signature: string;
          try {
            signature =
              pending.chain === "solana"
                ? await signSolanaWithTrezor(pending, wallet)
                : await signEvmWithTrezor(pending, wallet);
          } finally {
            clearInterval(keepAlive);
          }
          // The user may have cancelled the popup while the device prompt was open.
          const current = await getRequest(id);
          if (!current || current.kind !== "sign" || current.status !== "pending") {
            return { ok: false, error: "Request no longer pending" };
          }
          try {
            const result = await finalizeSignature(current, signature);
            resolveRequest(id, result);
            return { ok: true };
          } catch (error) {
            log?.error("trezor-sign finalize failed:", error);
            rejectRequest(id, readableError(error));
            return { ok: false, error: readableError(error) };
          }
        } catch (error) {
          // Device cancellations/denials leave the request pending for retry.
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        } finally {
          trezorSigning.delete(id);
        }
      }

      case "trezor-get-xpub": {
        const { path } = msg;
        if (!path.trim()) return { ok: false, error: "Derivation path is required" };
        const keepAlive = setInterval(() => {
          void browser.runtime.getPlatformInfo().catch(() => undefined);
        }, 20_000);
        try {
          const xpub = await getTrezorXpub(path.trim());
          return { ok: true, xpub };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        } finally {
          clearInterval(keepAlive);
        }
      }

      case "sign-result": {
        const { id, ok, result, error } = msg;
        if (ok) {
          resolveRequest(id, result);
          return { ok: true };
        }
        rejectRequest(id, error ?? "Signing failed");
        return { ok: false };
      }

      case "cancel-request": {
        const request = await getRequest(msg.id);
        if (!request || request.status !== "pending") return { ok: false };
        rejectRequest(msg.id, "SlothSign: request cancelled");
        return { ok: true };
      }

      case "signer-closed": {
        const request = await getRequest(msg.id);
        if (request && request.status === "pending") {
          log?.debug(`signer window closed, cancelling request ${msg.id}`);
          rejectRequest(msg.id, "SlothSign: request cancelled");
        } else {
          void showNextRequest();
        }
        return { ok: true };
      }

      case "get-pending-requests": {
        return listPendingRequests();
      }

      case "get-wallets": {
        return readStoredWallets();
      }

      case "set-wallets": {
        const wallets = msg.wallets.map((w) => {
          const wallet = normalizeWallet(w);
          const result = validateWallet(wallet);
          if (result === null) return wallet;
          return { ...wallet, validated: result };
        });
        const prevWallets = await readStoredWallets();
        await writeStoredWallets(wallets);
        const active = resolveActiveWallets(prevWallets, await readActiveWallets());
        const nextActive = reconcileActiveWallets(active, prevWallets, wallets, msg.active);
        if (JSON.stringify(nextActive) !== JSON.stringify(active)) {
          await writeActiveWallets(nextActive);
        }
        return wallets;
      }

      case "get-active-wallets": {
        return readActiveWallets();
      }

      case "set-active-wallet": {
        const wallets = await readStoredWallets();
        const exists = wallets.some((w) => w.chain === msg.chain && w.id === msg.id);
        const active = await readActiveWallets();
        const next = { ...active };
        if (exists) next[msg.chain] = msg.id;
        await writeActiveWallets(next);
        return next;
      }

      default:
        return undefined;
    }
  },
);
