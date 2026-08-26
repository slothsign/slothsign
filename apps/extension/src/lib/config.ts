import browser from "webextension-polyfill";
import type { AccountRef, Chain } from "@slothsign/core";
import { isAddress } from "viem";
import { PublicKey } from "@solana/web3.js";
import { evmAddressFromXpub, fingerprintFromXpub } from "@slothsign/keystore";
import { nanoid } from "nanoid";
import { z } from "zod";
import { ActiveWalletsSchema, type ActiveWallets } from "./messages.ts";

export { ActiveWalletsSchema };
export type { ActiveWallets };

export type SignerMode = "watch-only" | "keystone-qr" | "trezor" | "address-qr";

export const SIGNER_MODE_LABELS: Record<SignerMode, string> = {
  "watch-only": "Watch-only",
  "keystone-qr": "Keystone / AirGap QR",
  trezor: "Trezor",
  "address-qr": "Address QR",
};

export const SIGNER_MODE_DESCRIPTIONS: Record<SignerMode, string> = {
  "watch-only": "View-only — this wallet can never sign.",
  "keystone-qr": "Sign with an external device via QR (Keystone / AirGap Vault) — no keys stored.",
  trezor: "Sign with a connected Trezor hardware wallet.",
  "address-qr": "Sign via QR located by address — no path or xpub required.",
};

export const CHAIN_LABELS: Record<Chain, string> = {
  ethereum: "EVM",
  solana: "Solana",
};

export interface WalletConfig extends AccountRef {
  id: string;
  signer: SignerMode;
  label: string;
  createdAt: number;
  /** BIP-32 derivation path (keystone-qr EVM / AirGap Vault). */
  path?: string;
  /** Extended public key at the derivation path (keystone-qr EVM / AirGap Vault). */
  xpub?: string;
  /** Whether the address matches the address derived from path+xpub. */
  validated?: boolean;
}

export const DEFAULT_EVM_PATH = "m/44'/60'/0'/0/0";
export const DEFAULT_SOLANA_PATH = "m/44'/501'/0'/0'";

export function defaultPath(chain: Chain): string {
  return chain === "solana" ? DEFAULT_SOLANA_PATH : DEFAULT_EVM_PATH;
}

export function normalizeEvmPath(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || DEFAULT_EVM_PATH;
}

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

export const WalletConfigSchema = z.object({
  id: z.string().optional(),
  chain: z.enum(["ethereum", "solana"]),
  address: z.string(),
  signer: z.enum(["watch-only", "keystone-qr", "trezor", "address-qr"]),
  label: z.string().default(""),
  createdAt: z.number().default(() => Date.now()),
  path: z.string().trim().optional(),
  xpub: z.string().trim().optional(),
  validated: z.boolean().optional(),
});

export function ensureWalletId(wallet: z.infer<typeof WalletConfigSchema>): WalletConfig {
  return { ...wallet, id: wallet.id ?? nanoid(), path: wallet.path || defaultPath(wallet.chain) };
}

/** Migrate persisted wallets to current schema shapes (e.g. legacy "offline" signer). */
function migrateStoredWallet(input: unknown): unknown {
  if (
    typeof input === "object" &&
    input !== null &&
    (input as { signer?: unknown }).signer === "offline"
  ) {
    return { ...(input as Record<string, unknown>), signer: "keystone-qr" };
  }
  return input;
}

export function parseStoredWallets(value: unknown): WalletConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const result = WalletConfigSchema.safeParse(migrateStoredWallet(entry));
    return result.success ? [ensureWalletId(result.data)] : [];
  });
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

export function parseActiveWallets(value: unknown): ActiveWallets {
  const result = ActiveWalletsSchema.safeParse(value);
  return result.success ? result.data : {};
}

export async function readActiveWallets(): Promise<ActiveWallets> {
  const { activeWallets } = await browser.storage.local.get("activeWallets");
  return parseActiveWallets(activeWallets);
}

export async function writeActiveWallets(activeWallets: ActiveWallets): Promise<void> {
  await browser.storage.local.set({ activeWallets });
}

/**
 * Resolve the active wallet references to wallet ids, migrating legacy
 * address-based values to ids and dropping dangling entries.
 */
export function resolveActiveWallets(
  wallets: WalletConfig[],
  active: ActiveWallets,
): ActiveWallets {
  const resolved: ActiveWallets = {};
  for (const chain of ["ethereum", "solana"] as const) {
    const value = active[chain];
    if (!value) continue;
    const chainWallets = wallets.filter((w) => w.chain === chain);
    const match =
      chainWallets.find((w) => w.id === value) ??
      chainWallets.find((w) => w.address.toLowerCase() === value.toLowerCase());
    if (match) resolved[chain] = match.id;
  }
  return resolved;
}

/**
 * Recompute the active wallet for each chain after the wallet list changes.
 * Keeps the active wallet if it still exists; otherwise falls back to the
 * wallet now at the same index, or null. Auto-selects the first wallet when
 * one is added to a chain that had none. An explicit active id overrides the
 * reconcile for its chain when it still exists.
 */
export function reconcileActiveWallets(
  active: ActiveWallets,
  prevWallets: WalletConfig[],
  nextWallets: WalletConfig[],
  explicit?: ActiveWallets,
): ActiveWallets {
  const next: ActiveWallets = { ...active };
  for (const chain of ["ethereum", "solana"] as const) {
    const prevChain = prevWallets.filter((w) => w.chain === chain);
    const nextChain = nextWallets.filter((w) => w.chain === chain);

    const explicitId = explicit?.[chain];
    if (explicitId && nextChain.some((w) => w.id === explicitId)) {
      next[chain] = explicitId;
      continue;
    }

    const activeId = active[chain];
    if (!activeId) {
      if (prevChain.length === 0 && nextChain.length > 0) {
        const first = nextChain[0];
        if (first) next[chain] = first.id;
      }
      continue;
    }
    if (nextChain.some((w) => w.id === activeId)) continue;
    const index = prevChain.findIndex((w) => w.id === activeId);
    const replacement = nextChain[index];
    if (replacement) next[chain] = replacement.id;
    else delete next[chain];
  }
  return next;
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

export function validateAddress(ref: AccountRef): string | null {
  const value = ref.address.trim();
  if (!value) return "Address is required";
  if (ref.chain === "ethereum") {
    return isAddress(value) ? null : "Invalid EVM address";
  }
  try {
    new PublicKey(value);
    return null;
  } catch {
    return "Invalid Solana public key";
  }
}

function isValidSolanaAddress(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

const EVM_PATH_SEGMENT = /^\d+'?$/;

/**
 * Validate an extended public key for a keystone-qr EVM wallet. Returns an
 * error message when the xpub can't be parsed, or `null` when it's empty or
 * valid.
 */
export function validateXpub(value: string | undefined): string | null {
  const xpub = (value ?? "").trim();
  if (!xpub) return null;
  try {
    fingerprintFromXpub(xpub);
    return null;
  } catch {
    return "Invalid extended public key (xpub)";
  }
}

/**
 * Validate a derivation path for a keystone-qr EVM wallet. A valid path points
 * to a concrete receiving address (purpose'/coin'/account'/change/index), so
 * account-root paths like `m/44'/60'/0'` are rejected.
 */
export function validateDerivationPath(value: string | undefined): string | null {
  const path = (value ?? "").trim();
  if (!path) return null;
  if (!/^[mM]\//.test(path)) return "Path must start with m/";
  const segments = path
    .replace(/^[mM]\//, "")
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) return "Invalid derivation path";
  if (segments.some((s) => s === "*")) return "Wildcards are not allowed";
  if (segments.some((s) => !EVM_PATH_SEGMENT.test(s))) {
    return "Path segments must be numbers, optionally hardened (e.g. 44')";
  }
  if (segments.length < 5) {
    return "Path must point to a receiving address (e.g. m/44'/60'/0'/0/0)";
  }
  return null;
}

/**
 * Validate a derivation path for a keystone-qr Solana wallet. Standard Solana
 * paths look like `m/44'/501'/0'/0'` (purpose'/coin'/account'/change').
 */
export function validateSolanaPath(value: string | undefined): string | null {
  const path = (value ?? "").trim();
  if (!path) return null;
  if (!/^[mM]\//.test(path)) return "Path must start with m/";
  const segments = path
    .replace(/^[mM]\//, "")
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) return "Invalid derivation path";
  if (segments.some((s) => s === "*")) return "Wildcards are not allowed";
  if (segments.some((s) => !EVM_PATH_SEGMENT.test(s))) {
    return "Path segments must be numbers, optionally hardened (e.g. 44')";
  }
  if (segments.length < 4) {
    return "Path must be account level (e.g. m/44'/501'/0'/0')";
  }
  return null;
}

const SIGNERS = ["watch-only", "keystone-qr", "trezor", "address-qr"] as const;

export const walletFormSchema = z.union([
  z
    .object({
      chain: z.literal("ethereum"),
      address: z.string().trim().refine(isAddress, "Invalid EVM address"),
      signer: z.enum(SIGNERS),
      label: z.string().trim().max(40, "Label must be 40 characters or fewer").optional(),
      path: z.string().trim().optional(),
      xpub: z
        .string()
        .trim()
        .refine((v) => validateXpub(v) === null, "Invalid extended public key (xpub)")
        .optional(),
    })
    .superRefine((data, ctx) => {
      const message = validateDerivationPath(data.path);
      if (message) ctx.addIssue({ code: "custom", path: ["path"], message });
    }),
  z
    .object({
      chain: z.literal("solana"),
      address: z.string().trim().refine(isValidSolanaAddress, "Invalid Solana public key"),
      signer: z.enum(SIGNERS),
      label: z.string().trim().max(40, "Label must be 40 characters or fewer").optional(),
      path: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      const message = validateSolanaPath(data.path);
      if (message) ctx.addIssue({ code: "custom", path: ["path"], message });
    }),
]);

/**
 * A wallet can sign only when it has an actual signer configured: watch-only is
 * never signable, and a keystone-qr wallet needs a derivation path (and xpub
 * for EVM, which derives the address from the path). A missing wallet cannot
 * sign.
 */
export function isSignableWallet(wallet: WalletConfig | undefined): boolean {
  if (!wallet) return false;
  if (wallet.signer === "watch-only") return false;
  if (wallet.signer === "keystone-qr") {
    if (wallet.chain === "ethereum") return Boolean(wallet.path && wallet.xpub);
    if (wallet.chain === "solana") return Boolean(wallet.path);
  }
  return true;
}

export type WalletFormValues = z.infer<typeof walletFormSchema>;

export function walletForAddress(
  wallets: WalletConfig[],
  ref: AccountRef,
): WalletConfig | undefined {
  return wallets.find(
    (w) => w.chain === ref.chain && w.address.toLowerCase() === ref.address.toLowerCase(),
  );
}

export function normalizeWallet(input: unknown): WalletConfig {
  return ensureWalletId(WalletConfigSchema.parse(migrateStoredWallet(input)));
}

/**
 * Validate that a wallet's path+xpub derive to its address.
 * Returns `null` when validation doesn't apply (not keystone-qr EVM, or
 * missing path/xpub). Returns `true`/`false` for the match status.
 */
export function validateWallet(wallet: WalletConfig): boolean | null {
  if (wallet.chain !== "ethereum" || wallet.signer !== "keystone-qr") return null;
  if (!wallet.path || !wallet.xpub) return null;
  try {
    return (
      evmAddressFromXpub(wallet.xpub, wallet.path).toLowerCase() === wallet.address.toLowerCase()
    );
  } catch {
    return false;
  }
}
