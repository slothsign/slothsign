import browser from "webextension-polyfill";
import type { Chain } from "@slothsign/core";
import { z } from "zod";
import type { ActiveWallets } from "../lib/messages.ts";
import type { WalletConfig } from "../lib/types.ts";
import { parseActiveWallets, parseStoredWallets, validateWallet } from "../lib/wallet.ts";

export const INITIAL_EVM_CHAIN_ID = "0x1";

export async function readEvmChainId(): Promise<string> {
  const { evmChainId } = await browser.storage.local.get("evmChainId");
  if (typeof evmChainId !== "string") {
    await writeEvmChainId(INITIAL_EVM_CHAIN_ID);
    return INITIAL_EVM_CHAIN_ID;
  }
  return evmChainId;
}

export async function writeEvmChainId(chainId: string): Promise<void> {
  await browser.storage.local.set({ evmChainId: chainId });
}

export const INITIAL_CHAIN_TAB: Chain = "ethereum";

export async function readLastChainTab(): Promise<Chain> {
  const { lastChainTab } = await browser.storage.local.get("lastChainTab");
  return lastChainTab === "ethereum" || lastChainTab === "solana"
    ? lastChainTab
    : INITIAL_CHAIN_TAB;
}

export async function writeLastChainTab(chain: Chain): Promise<void> {
  await browser.storage.local.set({ lastChainTab: chain });
}

/** Storage key for user-configured RPC endpoints, keyed by chain. */
export const SOLANA_RPC_KEY = "solana";

export const RpcUrlsSchema = z.record(z.string(), z.string());

export type RpcUrls = z.infer<typeof RpcUrlsSchema>;

export function parseRpcUrls(value: unknown): RpcUrls {
  const result = RpcUrlsSchema.safeParse(value);
  return result.success ? result.data : {};
}

export async function readRpcUrls(): Promise<RpcUrls> {
  const { rpcUrls } = await browser.storage.local.get("rpcUrls");
  return parseRpcUrls(rpcUrls);
}

export async function writeRpcUrls(rpcUrls: RpcUrls): Promise<void> {
  await browser.storage.local.set({ rpcUrls });
}

/**
 * Validate a user-provided RPC URL. Returns `null` when empty or a valid
 * `http(s)://` URL, otherwise an error message.
 */
export function validateRpcUrl(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Invalid RPC URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "RPC URL must use http:// or https://";
  }
  return null;
}

export async function readStoredWallets(): Promise<WalletConfig[]> {
  const { wallets } = await browser.storage.local.get("wallets");
  const raw = Array.isArray(wallets) ? wallets : [];
  const parsed = parseStoredWallets(raw);
  const needsBackfill = raw.some(
    (w) => typeof w === "object" && w !== null && typeof (w as { id?: unknown }).id !== "string",
  );
  const needsValidation = parsed.some(
    (w) => w.validated === undefined && validateWallet(w) !== null,
  );
  if (needsValidation) {
    const backfilled = parsed.map((w) => {
      const result = w.validated !== undefined ? null : validateWallet(w);
      return result !== null ? { ...w, validated: result } : w;
    });
    await writeStoredWallets(backfilled);
    return backfilled;
  }
  if (needsBackfill) await writeStoredWallets(parsed);
  return parsed;
}

export async function writeStoredWallets(wallets: WalletConfig[]): Promise<void> {
  await browser.storage.local.set({ wallets });
}

export async function readActiveWallets(): Promise<ActiveWallets> {
  const { activeWallets } = await browser.storage.local.get("activeWallets");
  return parseActiveWallets(activeWallets);
}

export async function writeActiveWallets(activeWallets: ActiveWallets): Promise<void> {
  await browser.storage.local.set({ activeWallets });
}

const ConnectedOriginsSchema = z.object({
  ethereum: z.array(z.string()).optional(),
  solana: z.array(z.string()).optional(),
});

export type ConnectedOrigins = z.infer<typeof ConnectedOriginsSchema>;

export function parseConnectedOrigins(value: unknown): ConnectedOrigins {
  const result = ConnectedOriginsSchema.safeParse(value);
  return result.success ? result.data : {};
}

export async function readConnectedOrigins(): Promise<ConnectedOrigins> {
  const { connectedOrigins } = await browser.storage.local.get("connectedOrigins");
  return parseConnectedOrigins(connectedOrigins);
}

export async function writeConnectedOrigins(origins: ConnectedOrigins): Promise<void> {
  await browser.storage.local.set({ connectedOrigins: origins });
}

export function isOriginConnected(
  origins: ConnectedOrigins,
  chain: Chain,
  origin: string,
): boolean {
  return (origins[chain] ?? []).includes(origin);
}

export async function markOriginConnected(chain: Chain, origin: string): Promise<void> {
  if (!origin || origin === "unknown") return;
  const origins = await readConnectedOrigins();
  const list = origins[chain] ?? [];
  if (list.includes(origin)) return;
  await writeConnectedOrigins({ ...origins, [chain]: [...list, origin] });
}

export async function unmarkOriginConnected(chain: Chain, origin: string): Promise<void> {
  if (!origin || origin === "unknown") return;
  const origins = await readConnectedOrigins();
  const list = (origins[chain] ?? []).filter((o) => o !== origin);
  await writeConnectedOrigins({ ...origins, [chain]: list });
}
