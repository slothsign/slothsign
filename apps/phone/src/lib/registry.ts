import type { AccountRef, Chain } from "@slothsign/core";
import { isChecksummedMnemonic } from "@slothsign/keystore";
import {
  deriveWalletAddress,
  inferChain,
  normalizeAddress,
  pathChain,
  type Wallet,
} from "@slothsign/signing";
import { z } from "zod";

export interface RegistryAccount {
  chain: Chain;
  address: string;
  /** Derivation path; absent for a raw private key. */
  path?: string;
}

/** Non-secret description of a wallet. The key material is stored separately. */
export interface RegistryWallet {
  id: string;
  name: string;
  kind: Wallet["kind"];
  accounts: RegistryAccount[];
}

export interface Registry {
  version: 1;
  wallets: RegistryWallet[];
}

export type WalletDraft =
  | { kind: "mnemonic"; name: string; mnemonic: string; passphrase: string; paths: string }
  | { kind: "privateKey"; name: string; privateKey: string };

export const EMPTY_REGISTRY: Registry = { version: 1, wallets: [] };

const RegistrySchema = z.object({
  version: z.literal(1),
  wallets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(["mnemonic", "privateKey"]),
      accounts: z.array(
        z.object({
          chain: z.enum(["ethereum", "solana"]),
          address: z.string(),
          path: z.string().optional(),
        }),
      ),
    }),
  ),
});

export function parseRegistry(raw: string): Registry {
  return RegistrySchema.parse(JSON.parse(raw)) as Registry;
}

/** A problem with what the user entered; its message is written for them. */
export class WalletInputError extends Error {
  override name = "WalletInputError";
}

/** The message to show for a failed wallet change. */
export function walletErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.name === "WalletInputError" ? error.message : fallback;
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new WalletInputError("Give this wallet a name.");
  return trimmed;
}

function parsePaths(paths: string): string[] {
  const list = paths
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
  if (list.length === 0) throw new WalletInputError("Add at least one derivation path.");
  if (new Set(list).size !== list.length) {
    throw new WalletInputError("Derivation paths must be unique.");
  }
  for (const path of list) {
    if (!isSupportedPath(path)) {
      throw new WalletInputError(`"${path}" is not a supported Ethereum or Solana path.`);
    }
  }
  return list;
}

function isSupportedPath(path: string): boolean {
  if (!/^m(\/\d+'?)+$/.test(path)) return false;
  try {
    // Solana keys can only be derived along hardened segments.
    return pathChain(path) !== "solana" || !/\d(\/|$)/.test(path);
  } catch {
    return false;
  }
}

function mnemonicWallet(id: string, draft: Extract<WalletDraft, { kind: "mnemonic" }>): Wallet {
  const mnemonic = normalizeMnemonic(draft.mnemonic);
  if (!isChecksummedMnemonic(mnemonic)) {
    throw new WalletInputError("That recovery phrase isn't valid. Check each word and its order.");
  }
  return {
    id,
    kind: "mnemonic",
    mnemonic,
    passphrase: draft.passphrase,
    paths: parsePaths(draft.paths),
  };
}

function privateKeyWallet(id: string, draft: Extract<WalletDraft, { kind: "privateKey" }>): Wallet {
  const privateKey = draft.privateKey.trim();
  let chain: Chain;
  try {
    chain = inferChain(privateKey);
  } catch {
    throw new WalletInputError("That private key isn't a valid Ethereum or Solana key.");
  }
  return { id, kind: "privateKey", chain, privateKey };
}

/** Derive the account at each path. Takes about 1.5 s per path on a phone. */
export function deriveAccounts(secret: Wallet, paths: string[]): RegistryAccount[] {
  return paths.map((path) => ({
    chain: pathChain(path),
    address: deriveWalletAddress(secret, path),
    path,
  }));
}

/**
 * Validate a draft and derive its addresses. Slow on a phone (about 1.5 s per
 * mnemonic path), so callers should show progress first.
 */
export function buildWallet(id: string, draft: WalletDraft) {
  const name = requireName(draft.name);
  const secret =
    draft.kind === "mnemonic" ? mnemonicWallet(id, draft) : privateKeyWallet(id, draft);
  const accounts: RegistryAccount[] =
    secret.kind === "mnemonic"
      ? deriveAccounts(secret, secret.paths)
      : [{ chain: secret.chain, address: deriveWalletAddress(secret) }];
  const entry: RegistryWallet = { id, name, kind: secret.kind, accounts };
  return { secret, entry };
}

function accountKey(account: AccountRef): string {
  return `${account.chain}:${normalizeAddress(account.address)}`;
}

export function findAccount(registry: Registry, ref: AccountRef) {
  const key = accountKey(ref);
  for (const wallet of registry.wallets) {
    const account = wallet.accounts.find((candidate) => accountKey(candidate) === key);
    if (account) return { wallet, account };
  }
  return undefined;
}

function assertAccountsFree(registry: Registry, accounts: RegistryAccount[]): void {
  for (const account of accounts) {
    const existing = findAccount(registry, account);
    if (existing) {
      throw new WalletInputError(`${account.address} is already in "${existing.wallet.name}".`);
    }
  }
}

export function addToRegistry(registry: Registry, entry: RegistryWallet): Registry {
  assertAccountsFree(registry, entry.accounts);
  return { ...registry, wallets: [...registry.wallets, entry] };
}

export function removeFromRegistry(registry: Registry, id: string): Registry {
  return { ...registry, wallets: registry.wallets.filter((wallet) => wallet.id !== id) };
}

/** Editable parts of a wallet. Key material never changes after it is added. */
export interface WalletEdit {
  name: string;
  /** One derivation path per line; ignored for a private key wallet. */
  paths?: string;
}

function editedPaths(wallet: RegistryWallet, edit: WalletEdit): string[] | undefined {
  return wallet.kind === "mnemonic" && edit.paths !== undefined
    ? parsePaths(edit.paths)
    : undefined;
}

/**
 * Validate an edit and list the paths that have no address yet. Only these need
 * the wallet's key, so renaming or removing a path never asks for an unlock.
 */
export function pathsToDerive(wallet: RegistryWallet, edit: WalletEdit): string[] {
  requireName(edit.name);
  const known = new Set(wallet.accounts.map((account) => account.path));
  return (editedPaths(wallet, edit) ?? []).filter((path) => !known.has(path));
}

/** Apply an edit, keeping the wallet's position. `derived` covers `pathsToDerive`. */
export function applyWalletEdit(
  registry: Registry,
  wallet: RegistryWallet,
  edit: WalletEdit,
  derived: RegistryAccount[],
): Registry {
  const name = requireName(edit.name);
  const available = [...wallet.accounts, ...derived];
  const accounts =
    editedPaths(wallet, edit)?.map((path) => {
      const account = available.find((candidate) => candidate.path === path);
      if (!account) throw new Error(`Missing address for ${path}`);
      return account;
    }) ?? wallet.accounts;
  assertAccountsFree(removeFromRegistry(registry, wallet.id), accounts);
  return {
    ...registry,
    wallets: registry.wallets.map((candidate) =>
      candidate.id === wallet.id ? { ...candidate, name, accounts } : candidate,
    ),
  };
}
