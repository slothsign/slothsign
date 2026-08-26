import browser from "webextension-polyfill";
import { decodeResult } from "@slothsign/core";
import { payloadToTx } from "@slothsign/chain-evm";
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
  type Hex,
} from "viem";
import { JsonRpcResponseSchema, RuntimeMessageSchema } from "../../lib/messages.ts";
import { evmSerializable } from "../../lib/keystone.ts";
import type { SignPendingRequest } from "../../lib/requestStore.ts";
import {
  isOriginConnected,
  markOriginConnected,
  normalizeWallet,
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
import { clearSignerWindow, getSignerWindow } from "../../lib/signerWindows.ts";
import {
  awaitResolution,
  confirmConnectRequest,
  createConnectRequest,
  createPendingRequest,
  getRequest,
  listPendingRequests,
  rejectRequest,
  resolveRequest,
} from "./requestManager.ts";

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
    console.error("[SlothSign] finalizeSignature: no chain for", chainId);
    throw new Error("SlothSign: no RPC endpoint for this chain");
  }
  const rpcUrls = await readRpcUrls();
  const url = getEvmRpcUrl(chain, rpcUrls);
  if (!url) {
    console.error("[SlothSign] finalizeSignature: no RPC URL for", chain.name);
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
    console.error("[SlothSign] prepareEvmTxParams failed:", e);
    return params;
  }
  return [next, ...params.slice(1)];
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
 * mirroring the background source of truth. Currently Solana only (the
 * wallet-standard snapshot has no query API); EVM queries live via eth_accounts.
 */
async function broadcastAccountsChanged(chain: "ethereum" | "solana"): Promise<void> {
  const wallets = await readStoredWallets();
  const active = await readActiveWallets();
  const origins = await readConnectedOrigins();
  const accounts = accountsFromWallets(wallets, active, chain);
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

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const relevant = ["activeWallets", "connectedOrigins", "storedWallets"].some(
    (key) => changes[key],
  );
  if (!relevant) return;
  await broadcastAccountsChanged("solana");
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  const entry = await getSignerWindow();
  if (!entry || entry.tabId !== tabId) return;
  await clearSignerWindow();
  const request = await getRequest(entry.requestId);
  if (request && request.status === "pending") {
    rejectRequest(entry.requestId, "SlothSign: request cancelled");
  }
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
        const origins = await readConnectedOrigins();
        const wallets = await readStoredWallets();
        const active = resolveActiveWallets(wallets, await readActiveWallets());
        if (isOriginConnected(origins, msg.chain, origin)) {
          return accountsFromWallets(wallets, active, msg.chain);
        }
        if (!active[msg.chain]) {
          throw new Error(`SlothSign: no active ${msg.chain} wallet`);
        }
        const accounts = accountsFromWallets(wallets, active, msg.chain);
        const request = await createConnectRequest({
          chain: msg.chain,
          originUrl: sender.url,
          accounts,
        });
        return awaitResolution(request.id);
      }

      case "confirm-connect": {
        try {
          await confirmConnectRequest(msg.id);
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
            console.error(`[SlothSign] RPC ${msg.method} failed: HTTP ${res.status}`);
            return { ok: false, code: -32603, message: `RPC request failed: HTTP ${res.status}` };
          }
          const parsed = JsonRpcResponseSchema.safeParse(await res.json());
          if (!parsed.success) {
            console.error(`[SlothSign] RPC ${msg.method}: invalid response`);
            return { ok: false, code: -32603, message: "Invalid RPC response" };
          }
          if (parsed.data.error) {
            console.error(`[SlothSign] RPC ${msg.method} error:`, parsed.data.error);
            return {
              ok: false,
              code: parsed.data.error.code,
              message: parsed.data.error.message,
              data: parsed.data.error.data,
            };
          }
          return { ok: true, result: parsed.data.result };
        } catch (error) {
          console.error(`[SlothSign] RPC ${msg.method} threw:`, error);
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
        const params =
          msg.chain === "ethereum" && msg.method === "eth_sendTransaction"
            ? await prepareEvmTxParams(msg.params, chainId)
            : msg.params;
        const request = await createPendingRequest({
          chain: msg.chain,
          method: msg.method,
          params,
          originUrl: sender.url,
          chainId,
        });
        await markOriginConnected(msg.chain, extractOrigin(sender.url));
        return awaitResolution(request.id);
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
          console.error("[SlothSign] submit-signature failed:", error);
          rejectRequest(id, readableError(error));
          return { ok: false, error: readableError(error) };
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
