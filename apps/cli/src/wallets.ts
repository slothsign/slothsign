import { statSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { derivePrivateKey, deriveSolanaPrivateKey, isValidMnemonic } from "@slothsign/keystore";
import { addressFromPrivateKey, type PrivateKey } from "@slothsign/chain-evm";
import { keypairFromMnemonic, keypairFromSecret, isValidSecretKey } from "@slothsign/chain-solana";
import { getBackend, cachePath } from "./keystore/index.ts";

const DIR = join(homedir(), ".sloth");
const DEFAULT_PATHS = ["m/44'/60'/0'/0/0", "m/44'/501'/0'/0'"];

export type Chain = "ethereum" | "solana";

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

function pathChain(path: string): Chain {
  const m = /^m\/44'\/(\d+)'/.exec(path);
  if (!m) throw new Error(`Invalid derivation path: ${path} (must start with m/44'/<coin>'...)`);
  const coin = Number(m[1]);
  if (coin === 60) return "ethereum";
  if (coin === 501) return "solana";
  throw new Error(
    `Unsupported coin type ${coin} in path: ${path} (supported: 60=ethereum, 501=solana)`,
  );
}

function inferChain(privateKey: string, explicit?: string): Chain {
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

function hex(bytes: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function deriveWalletAddress(wallet: Wallet, path?: string): string {
  if (wallet.kind === "mnemonic") {
    if (!path) throw new Error("Path required for mnemonic wallet derivation");
    const chain = pathChain(path);
    if (chain === "ethereum") {
      return addressFromPrivateKey(
        hex(derivePrivateKey(wallet.mnemonic, path, wallet.passphrase)) as PrivateKey,
      );
    }
    return keypairFromMnemonic(wallet.mnemonic, path, wallet.passphrase).publicKey.toBase58();
  }
  if (wallet.chain === "ethereum") {
    return addressFromPrivateKey(wallet.privateKey as PrivateKey);
  }
  return keypairFromSecret(wallet.privateKey).publicKey.toBase58();
}

function normalizeAddress(address: string): string {
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

/**
 * Read, decrypt and parse the wallets file.
 */
export function readWallets(): WalletsFile {
  return parseWalletsFile(getBackend().decryptWallets());
}

/**
 * Rebuild the address cache from the wallets file.
 */
export function rebuildCache(): void {
  const file = readWallets();
  const seen = new Map<string, string>();
  for (const { keyId, address } of walletEntries(file)) {
    const norm = normalizeAddress(address);
    const existing = seen.get(norm);
    if (existing) {
      throw new Error(`Duplicate address ${address} (${existing} and ${keyId})`);
    }
    seen.set(norm, keyId);
  }
  mkdirSync(dirname(cachePath()), { recursive: true });
  writeFileSync(
    cachePath(),
    JSON.stringify({ version: 1, addresses: Object.fromEntries(seen) }, null, 2) + "\n",
  );
}

/**
 * Rebuild the cache if the wallets file is newer than the cache.
 */
export function ensureCacheFresh(): void {
  const lastModified = getBackend().lastModified();
  if (lastModified === null) {
    throw new Error(`sloth: no wallet store found in ${getBackend().describe()}`);
  }
  if (!existsSync(cachePath())) {
    rebuildCache();
    return;
  }
  const cm = statSync(cachePath()).mtimeMs;
  if (lastModified > cm) rebuildCache();
}

/**
 * Read the cache file and return the address → keyId map.
 */
function readCache(): Record<string, string> {
  if (!existsSync(cachePath())) return {};
  try {
    const data = JSON.parse(readFileSync(cachePath(), "utf8"));
    return data?.addresses ?? {};
  } catch {
    return {};
  }
}

/**
 * Find the keyId for a given address using the cache.
 */
export function resolveKeyId(address: string): string | undefined {
  const norm = normalizeAddress(address);
  const cache = readCache();
  return cache[norm];
}

const TEMPLATE = `{
  "version": 1,
  "wallets": [
    {
      "id": "main",
      "kind": "mnemonic",
      "mnemonic": "",
      "passphrase": "",
      "paths": ["m/44'/60'/0'/0/0", "m/44'/501'/0'/0'"]
    }
  ]
}
`;

/**
 * Open the wallets file in $EDITOR for editing.
 */
export async function editWallets(): Promise<WalletsFile> {
  getBackend().ensureIdentity();
  const plaintext = getBackend().hasWallets() ? getBackend().decryptWallets() : TEMPLATE;
  const tmp = join(DIR, `.wallets-${process.pid}.json`);
  try {
    await writeFile(tmp, plaintext, { mode: 0o600 });
    const editor = process.env.EDITOR || "vi";
    const result = spawnSync(editor, [tmp], { stdio: "inherit", encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`Editor exited with status ${result.status}`);
    }
    const edited = readFileSync(tmp, "utf8");
    const file = parseWalletsFile(edited);
    getBackend().encryptWallets(JSON.stringify(file, null, 2) + "\n");
    rebuildCache();
    return file;
  } finally {
    try {
      await unlink(tmp);
    } catch {}
  }
}

/**
 * Read and validate a wallets file from stdin.
 */
export function editWalletsFromStdin(text: string): WalletsFile {
  getBackend().ensureIdentity();
  const file = parseWalletsFile(text);
  getBackend().encryptWallets(JSON.stringify(file, null, 2) + "\n");
  rebuildCache();
  return file;
}
