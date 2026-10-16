import type { AccountRef, Chain } from "@slothsign/core";
import { evmAddressFromXpub, fingerprintFromXpub } from "@slothsign/keystore";
import { PublicKey } from "@solana/web3.js";
import { isAddress } from "viem";
import { nanoid } from "nanoid";
import { z } from "zod";
import { defaultPath } from "./derivation.ts";
import { ActiveWalletsSchema, type ActiveWallets } from "./messages.ts";
import type { SignerMode, WalletConfig } from "./types.ts";

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

/** Which scanner app can read a signer's QR, if it has one. */
export const SIGNER_MODE_SCANNER_HINT: Record<SignerMode, string | null> = {
  "watch-only": null,
  "keystone-qr": "Scan with AirGap Vault or Keystone",
  trezor: null,
  "address-qr": "Scan with SlothSigner",
};

export const CHAIN_LABELS: Record<Chain, string> = {
  ethereum: "EVM",
  solana: "Solana",
};

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

export function parseActiveWallets(value: unknown): ActiveWallets {
  const result = ActiveWalletsSchema.safeParse(value);
  return result.success ? result.data : {};
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

/** EVM receiving path: `m/44'/60'/account'/change/index`. */
const EVM_PATH_PATTERN = /^m\/44'\/60'\/\d+'\/\d+\/\d+$/i;

/** Solana account path: `m/44'/501'/account'/change'`. */
const SOLANA_PATH_PATTERN = /^m\/44'\/501'\/\d+'\/\d+'$/i;

/**
 * Validate an extended public key for an EVM wallet. Returns an
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
 * Validate a derivation path for an EVM wallet. A valid path points to a
 * concrete receiving address under the Ethereum coin type
 * (`m/44'/60'/account'/change/index`).
 */
export function validateDerivationPath(value: string | undefined): string | null {
  const path = (value ?? "").trim();
  if (!path) return null;
  return EVM_PATH_PATTERN.test(path) ? null : "Path must look like m/44'/60'/0'/0/0";
}

/**
 * Validate a derivation path for a Solana wallet. Standard Solana paths look
 * like `m/44'/501'/0'/0'` (purpose'/coin'/account'/change'): the coin type is
 * enforced, and every segment must be hardened because SLIP-0010 ed25519
 * derivation supports hardened children only.
 */
export function validateSolanaPath(value: string | undefined): string | null {
  const path = (value ?? "").trim();
  if (!path) return null;
  return SOLANA_PATH_PATTERN.test(path) ? null : "Path must look like m/44'/501'/0'/0'";
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
 * Returns `null` when validation doesn't apply (not an EVM xpub wallet, or
 * missing path/xpub). Returns `true`/`false` for the match status. Trezor
 * wallets use this only for mismatch warnings — signing stays enabled and
 * the device is the source of truth.
 */
export function validateWallet(wallet: WalletConfig): boolean | null {
  if (wallet.chain !== "ethereum") return null;
  if (wallet.signer !== "keystone-qr" && wallet.signer !== "trezor") return null;
  if (!wallet.path || !wallet.xpub) return null;
  try {
    return (
      evmAddressFromXpub(wallet.xpub, wallet.path).toLowerCase() === wallet.address.toLowerCase()
    );
  } catch {
    return false;
  }
}
