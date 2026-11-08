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

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
}

function parsePaths(paths: string): string[] {
  const list = paths
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error("Add at least one derivation path.");
  if (new Set(list).size !== list.length) throw new Error("Derivation paths must be unique.");
  for (const path of list) {
    try {
      pathChain(path);
    } catch {
      throw new Error(`"${path}" is not a supported Ethereum or Solana path.`);
    }
  }
  return list;
}

function mnemonicWallet(id: string, draft: Extract<WalletDraft, { kind: "mnemonic" }>): Wallet {
  const mnemonic = normalizeMnemonic(draft.mnemonic);
  if (!isChecksummedMnemonic(mnemonic)) {
    throw new Error("That recovery phrase isn't valid. Check each word and its order.");
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
    throw new Error("That private key isn't a valid Ethereum or Solana key.");
  }
  return { id, kind: "privateKey", chain, privateKey };
}

/**
 * Validate a draft and derive its addresses. Slow on a phone (about 1.5 s per
 * mnemonic path), so callers should show progress first.
 */
export function buildWallet(id: string, draft: WalletDraft) {
  const name = draft.name.trim();
  if (!name) throw new Error("Give this wallet a name.");
  const secret =
    draft.kind === "mnemonic" ? mnemonicWallet(id, draft) : privateKeyWallet(id, draft);
  const accounts: RegistryAccount[] =
    secret.kind === "mnemonic"
      ? secret.paths.map((path) => ({
          chain: pathChain(path),
          address: deriveWalletAddress(secret, path),
          path,
        }))
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

export function addToRegistry(registry: Registry, entry: RegistryWallet): Registry {
  for (const account of entry.accounts) {
    const existing = findAccount(registry, account);
    if (existing) throw new Error(`${account.address} is already in "${existing.wallet.name}".`);
  }
  return { ...registry, wallets: [...registry.wallets, entry] };
}

export function removeFromRegistry(registry: Registry, id: string): Registry {
  return { ...registry, wallets: registry.wallets.filter((wallet) => wallet.id !== id) };
}
