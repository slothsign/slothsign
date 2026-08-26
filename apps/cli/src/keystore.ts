import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DIR = join(homedir(), ".sloth");

export function identityPath(): string {
  return process.env.SLOTH_IDENTITY ?? join(DIR, "identity.txt");
}

export function walletsPath(): string {
  return process.env.SLOTH_WALLETS ?? join(DIR, "wallets.age");
}

export function cachePath(): string {
  return process.env.SLOTH_CACHE ?? join(DIR, "addresses.json");
}

function requireBinary(name: "age" | "age-keygen"): void {
  const probe = spawnSync(name, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    throw new Error(`sloth: ${name} is not installed or not on PATH.`);
  }
}

function recipient(): string {
  if (process.env.SLOTH_RECIPIENT) return process.env.SLOTH_RECIPIENT;
  const identity = readIdentity();
  const match = /# public key: (\S+)/.exec(identity);
  if (!match?.[1]) throw new Error("sloth: no age public key in identity file");
  return match[1];
}

export function hasIdentity(): boolean {
  return existsSync(identityPath());
}

export function hasWallets(): boolean {
  return existsSync(walletsPath());
}

function readIdentity(): string {
  const path = identityPath();
  if (!existsSync(path)) {
    throw new Error(`sloth: identity file not found at ${path}`);
  }
  return readFileSync(path, "utf8");
}

/**
 * Generate the age identity file (age-keygen) if it does not exist.
 */
export function ensureIdentity(): void {
  const path = identityPath();
  if (existsSync(path)) return;
  mkdirSync(DIR, { recursive: true });
  requireBinary("age-keygen");
  const result = spawnSync("age-keygen", ["-o", path], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`sloth: age-keygen failed: ${result.stderr ?? result.stdout}`);
  }
}

/**
 * Encrypt plaintext to wallets.age for the identity's public key.
 */
export function encryptWallets(plaintext: string): void {
  const path = walletsPath();
  mkdirSync(DIR, { recursive: true });
  requireBinary("age");
  const result = spawnSync("age", ["-r", recipient(), "-o", path], {
    input: plaintext,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`sloth: age encryption failed: ${result.stderr ?? result.stdout}`);
  }
}

/**
 * Decrypt wallets.age and return the plaintext.
 */
export function decryptWallets(): string {
  const path = walletsPath();
  if (!existsSync(path)) {
    throw new Error(`sloth: wallets file not found at ${path}`);
  }
  requireBinary("age");
  const result = spawnSync("age", ["-d", "-i", identityPath(), path], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`sloth: age decryption failed: ${result.stderr ?? result.stdout}`);
  }
  return result.stdout;
}

export function publicKey(): string {
  const identity = readIdentity();
  const match = /# public key: (\S+)/.exec(identity);
  if (!match?.[1]) throw new Error("sloth: no age public key in identity file");
  return match[1];
}
