import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { KeystoreBackend } from "./types.ts";

const DIR = join(homedir(), ".sloth");

function identityPath(): string {
  return process.env.SLOTH_IDENTITY ?? join(DIR, "identity.txt");
}

function walletsPath(): string {
  return process.env.SLOTH_WALLETS ?? join(DIR, "wallets.age");
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

function readIdentity(): string {
  const path = identityPath();
  if (!existsSync(path)) {
    throw new Error(`sloth: identity file not found at ${path}`);
  }
  return readFileSync(path, "utf8");
}

function generateIdentity(): void {
  const path = identityPath();
  if (existsSync(path)) return;
  mkdirSync(DIR, { recursive: true });
  requireBinary("age-keygen");
  const result = spawnSync("age-keygen", ["-o", path], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`sloth: age-keygen failed: ${result.stderr ?? result.stdout}`);
  }
}

function encryptWallets(plaintext: string): void {
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

function decryptWallets(): string {
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

export const ageBackend: KeystoreBackend = {
  mode: "age",
  hasWallets: () => existsSync(walletsPath()),
  encryptWallets,
  decryptWallets,
  ensureIdentity: generateIdentity,
  lastModified: () => {
    if (!existsSync(walletsPath())) return null;
    return statSync(walletsPath()).mtimeMs;
  },
  describe: () => walletsPath(),
};
