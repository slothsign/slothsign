import { z } from "zod";
import { addressFromPrivateKey, type PrivateKey } from "@slothsign/chain-evm";
import { isValidSecretKey, keypairFromMnemonic, keypairFromSecret } from "@slothsign/chain-solana";
import type { Chain } from "@slothsign/core";
import { derivePrivateKey, deriveSolanaPrivateKey, isValidMnemonic } from "@slothsign/keystore";

export const DEFAULT_PATHS = ["m/44'/60'/0'/0/0", "m/44'/501'/0'/0'"];

export interface MnemonicWallet {
  id: string;
  kind: "mnemonic";
  mnemonic: string;
  passphrase: string;
  paths: string[];
}

export interface PrivateKeyWallet {
  id: string;
  kind: "privateKey";
  chain: Chain;
  privateKey: string;
}

export type Wallet = MnemonicWallet | PrivateKeyWallet;

export interface WalletsFile {
  version: number;
  wallets: Wallet[];
}

const MnemonicSchema = z.object({
  id: z.string().trim().min(1, "wallet id is required"),
  kind: z.literal("mnemonic"),
  mnemonic: z.string().trim().min(1, "mnemonic is required"),
  passphrase: z.string().default(""),
  paths: z.array(z.string().trim()).default(DEFAULT_PATHS),
});

const PrivateKeySchema = z.object({
  id: z.string().trim().min(1, "wallet id is required"),
  kind: z.literal("privateKey"),
  chain: z.enum(["ethereum", "solana"]).optional(),
  privateKey: z.string().trim().min(1, "privateKey is required"),
});

const WalletsSchema = z.object({
  version: z.number().int().positive().default(1),
  wallets: z
    .array(z.discriminatedUnion("kind", [MnemonicSchema, PrivateKeySchema]))
    .min(1, "at least one wallet is required"),
});

export function pathChain(path: string): Chain {
  const m = /^m\/44'\/(\d+)'/.exec(path);
  if (!m) throw new Error(`Invalid derivation path: ${path} (must start with m/44'/<coin>'...)`);
  const coin = Number(m[1]);
  if (coin === 60) return "ethereum";
  if (coin === 501) return "solana";
  throw new Error(
    `Unsupported coin type ${coin} in path: ${path} (supported: 60=ethereum, 501=solana)`,
  );
}

export function inferChain(privateKey: string, explicit?: string): Chain {
  let inferred: Chain;
  if (/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    inferred = "ethereum";
  } else if (isValidSecretKey(privateKey)) {
    inferred = "solana";
  } else {
    throw new Error(
      `Invalid private key: expected 0x-prefixed 32-byte hex (ethereum) or base58 32/64-byte secret (solana)`,
    );
  }
  if (explicit && explicit !== inferred) {
    throw new Error(`Chain mismatch: '${explicit}' does not match the key format (${inferred})`);
  }
  return inferred;
}

export function hexPrivateKey(bytes: Uint8Array): PrivateKey {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function deriveWalletAddress(wallet: Wallet, path?: string): string {
  if (wallet.kind === "mnemonic") {
    if (!path) throw new Error("Path required for mnemonic wallet derivation");
    const chain = pathChain(path);
    if (chain === "ethereum") {
      return addressFromPrivateKey(
        hexPrivateKey(derivePrivateKey(wallet.mnemonic, path, wallet.passphrase)),
      );
    }
    return keypairFromMnemonic(wallet.mnemonic, path, wallet.passphrase).publicKey.toBase58();
  }
  if (wallet.chain === "ethereum") {
    return addressFromPrivateKey(wallet.privateKey as PrivateKey);
  }
  return keypairFromSecret(wallet.privateKey).publicKey.toBase58();
}

export function normalizeAddress(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

export function walletEntries(wallets: WalletsFile): Array<{ keyId: string; address: string }> {
  const entries: Array<{ keyId: string; address: string }> = [];
  for (const wallet of wallets.wallets) {
    if (wallet.kind === "mnemonic") {
      for (const path of wallet.paths) {
        entries.push({
          keyId: `${wallet.id}:${path}`,
          address: deriveWalletAddress(wallet, path),
        });
      }
    } else {
      entries.push({
        keyId: wallet.id,
        address: deriveWalletAddress(wallet),
      });
    }
  }
  return entries;
}

/**
 * Parse and normalize a wallet JSON string. Throws on any invalid JSON or
 * schema violation.
 */
export function parseWalletsFile(raw: string): WalletsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON: ${String(e)}`);
  }
  const result = WalletsSchema.safeParse(parsed);
  if (!result.success) {
    const msgs = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid wallets file: ${msgs}`);
  }
  const data = result.data;
  const ids = new Set<string>();
  const normalized: Wallet[] = [];
  for (const wallet of data.wallets) {
    if (ids.has(wallet.id)) {
      throw new Error(`Duplicate wallet id: ${wallet.id}`);
    }
    ids.add(wallet.id);
    if (wallet.kind === "mnemonic") {
      if (!isValidMnemonic(wallet.mnemonic)) {
        throw new Error(`Invalid mnemonic for wallet '${wallet.id}'`);
      }
      for (const path of wallet.paths) {
        pathChain(path);
        if (pathChain(path) === "solana") {
          deriveSolanaPrivateKey(wallet.mnemonic, path, wallet.passphrase);
        } else {
          derivePrivateKey(wallet.mnemonic, path, wallet.passphrase);
        }
      }
      normalized.push(wallet);
    } else {
      const chain = inferChain(wallet.privateKey, wallet.chain);
      deriveWalletAddress({ ...wallet, chain });
      normalized.push({ id: wallet.id, kind: "privateKey", chain, privateKey: wallet.privateKey });
    }
  }
  return { version: data.version, wallets: normalized };
}
