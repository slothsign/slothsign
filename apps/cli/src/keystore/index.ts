import { join } from "node:path";
import { homedir } from "node:os";
import type { KeystoreBackend, KeystoreMode } from "./types.ts";
import { ageBackend } from "./age.ts";
import { keychainBackend } from "./keychain.ts";

const DIR = join(homedir(), ".sloth");

export function cachePath(): string {
  return process.env.SLOTH_CACHE ?? join(DIR, "addresses.json");
}

export function supportedModes(): KeystoreMode[] {
  if (process.platform === "darwin") return ["keychain", "age"];
  return ["age"];
}

function resolveMode(): KeystoreMode {
  const modes = supportedModes();
  const requested = process.env.SLOTH_KEYSTORE;
  if (requested) {
    if (!modes.includes(requested as KeystoreMode)) {
      throw new Error(
        `sloth: SLOTH_KEYSTORE='${requested}' is not supported on ${process.platform}. Supported: ${modes.join(", ")}`,
      );
    }
    return requested as KeystoreMode;
  }
  return modes[0]!;
}

let _backend: KeystoreBackend | undefined;

export function getBackend(): KeystoreBackend {
  if (!_backend) {
    _backend = resolveMode() === "keychain" ? keychainBackend : ageBackend;
  }
  return _backend;
}
