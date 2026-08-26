import { randomBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { scrypt } from "@noble/hashes/scrypt.js";
import { gcm } from "@noble/ciphers/aes.js";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export const KDF_PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;

export interface KeystoreFile {
  version: 1;
  kdf: "scrypt";
  kdfParams: {
    N: number;
    r: number;
    p: number;
    salt: string;
  };
  cipher: "aes-256-gcm";
  cipherParams: {
    iv: string;
  };
  ciphertext: string;
  /** hex sha256 of the plaintext mnemonic, for integrity check */
  digest: string;
}

export function createMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

export function isValidMnemonic(mnemonic: string): boolean {
  try {
    mnemonicToSeedSync(mnemonic, "");
    return true;
  } catch {
    return false;
  }
}

function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return scrypt(new TextEncoder().encode(password), salt, {
    N: KDF_PARAMS.N,
    r: KDF_PARAMS.r,
    p: KDF_PARAMS.p,
    dkLen: 32,
  });
}

export async function createKeystore(mnemonic: string, password: string): Promise<KeystoreFile> {
  if (!isValidMnemonic(mnemonic)) throw new Error("Invalid mnemonic");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(mnemonic);
  const encrypted = gcm(key, iv).encrypt(plaintext);
  return {
    version: 1,
    kdf: "scrypt",
    kdfParams: { ...KDF_PARAMS, salt: toB64(salt) },
    cipher: "aes-256-gcm",
    cipherParams: { iv: toB64(iv) },
    ciphertext: toB64(encrypted),
    digest: hex(sha256(plaintext)),
  };
}

export function unlockKeystore(file: KeystoreFile, password: string): string {
  if (file.version !== 1 || file.kdf !== "scrypt") throw new Error("Unsupported keystore format");
  const key = deriveKey(password, fromB64(file.kdfParams.salt));
  const decrypted = gcm(key, fromB64(file.cipherParams.iv)).decrypt(fromB64(file.ciphertext));
  const mnemonic = new TextDecoder().decode(decrypted);
  if (!isValidMnemonic(mnemonic)) throw new Error("Wrong password or corrupted keystore");
  return mnemonic;
}

/**
 * Derive the raw seed (BIP-39) from a mnemonic.
 */
export function seedFromMnemonic(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(mnemonic, passphrase);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
