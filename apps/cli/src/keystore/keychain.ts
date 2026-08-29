import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import type { KeystoreBackend } from "./types.ts";

const SERVICE = "slothsign";
const ACCOUNT = "wallets";
const DESCRIPTION = `macOS Keychain (service ${SERVICE}, account ${ACCOUNT})`;

function run(args: string[], options: { input?: string } = {}): { status: number; stdout: string } {
  const result = spawnSync("security", args, { encoding: "utf8", input: options.input });
  if (result.error) {
    throw new Error(`sloth: security CLI failed: ${result.error.message}`);
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? "" };
}

function findItem(): { status: number; stdout: string } {
  return run(["find-generic-password", "-a", ACCOUNT, "-s", SERVICE, "-w"]);
}

function isHex(text: string): boolean {
  return text.length % 2 === 0 && /^[0-9a-f]+$/i.test(text);
}

export const keychainBackend: KeystoreBackend = {
  mode: "keychain",
  hasWallets: () => findItem().status === 0,
  encryptWallets(plaintext: string): void {
    const result = run([
      "add-generic-password",
      "-a",
      ACCOUNT,
      "-s",
      SERVICE,
      "-U",
      "-w",
      plaintext,
    ]);
    if (result.status !== 0) {
      throw new Error(
        `sloth: keychain store failed (security add-generic-password, status ${result.status})`,
      );
    }
  },
  decryptWallets(): string {
    const result = findItem();
    if (result.status !== 0) {
      throw new Error(`sloth: no wallet store found in ${DESCRIPTION}`);
    }
    const raw = result.stdout.replace(/\n$/, "");
    return isHex(raw) ? Buffer.from(raw, "hex").toString("utf8") : raw;
  },
  ensureIdentity(): void {},
  lastModified: () => (findItem().status === 0 ? Date.now() : null),
  describe: () => DESCRIPTION,
};
