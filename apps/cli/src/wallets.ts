import { statSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  normalizeAddress,
  parseWalletsFile,
  walletEntries,
  type WalletsFile,
} from "@slothsign/signing";
import { getBackend, cachePath } from "./keystore/index.ts";

export { walletEntries };
export type { Wallet, WalletsFile } from "@slothsign/signing";

const DIR = join(homedir(), ".sloth");

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
