import { HDKey } from "@scure/bip32";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { seedFromMnemonic } from "./keystore.ts";

export const EVM_PATH = "m/44'/60'/0'/0/0";
export const SOLANA_PATH = "m/44'/501'/0'/0'";

const HARDENED_OFFSET = 0x80000000;

/**
 * Derive a raw private key (32 bytes) from a mnemonic at a BIP-32 path.
 */
export function derivePrivateKey(mnemonic: string, path: string, passphrase = ""): Uint8Array {
  const seed = seedFromMnemonic(mnemonic, passphrase);
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey) throw new Error(`Failed to derive key at ${path}`);
  return node.privateKey;
}

/**
 * Parse a BIP-32 path into its child indices. Hardened segments use the `'`
 * or `h` suffix; SLIP-0010 ed25519 only supports hardened children.
 */
function parsePath(path: string): number[] {
  const segments = path
    .replace(/^[mM]\/?/, "")
    .split("/")
    .filter(Boolean);
  return segments.map((segment) => {
    const hardened = segment.endsWith("'") || /h$/i.test(segment);
    const index = Number.parseInt(segment.replace(/[h']$/i, ""), 10);
    if (!Number.isInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
      throw new Error(`Invalid derivation segment: ${segment}`);
    }
    return hardened ? index + HARDENED_OFFSET : index;
  });
}

function ser32(index: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, index, false);
  return bytes;
}

/**
 * Derive an ed25519 private key seed from a BIP-39 seed using SLIP-0010.
 * This is the derivation used by hardware wallets (Trezor, Ledger) and
 * solana-keygen: seed = BIP-39(mnemonic, passphrase), then
 * `m/44'/501'/account'/0'`.
 */
export function slip0010Seed(seed: Uint8Array, path: string): Uint8Array {
  let I = hmac(sha512, utf8ToBytes("ed25519 seed"), seed);
  let privateKey = I.slice(0, 32);
  let chainCode = I.slice(32);
  for (const index of parsePath(path)) {
    if (index < HARDENED_OFFSET) {
      throw new Error("SLIP-0010 ed25519 only supports hardened derivation");
    }
    I = hmac(sha512, chainCode, concatBytes(new Uint8Array([0]), privateKey, ser32(index)));
    privateKey = I.slice(0, 32);
    chainCode = I.slice(32);
  }
  return privateKey;
}

/**
 * Derive the Solana ed25519 private key seed for a mnemonic at a SLIP-0010
 * path (default `m/44'/501'/0'/0'`), using the BIP-39 passphrase.
 */
export function deriveSolanaPrivateKey(
  mnemonic: string,
  path = SOLANA_PATH,
  passphrase = "",
): Uint8Array {
  return slip0010Seed(seedFromMnemonic(mnemonic, passphrase), path);
}

/**
 * Compute the BIP-32 fingerprint (first 4 bytes of HASH160 of the compressed
 * public key) of the node an extended public key is derived at. This is the
 * value AirGap Vault validates eth-sign-request source fingerprints against;
 * no private keys are required.
 */
export function fingerprintFromXpub(xpub: string): string {
  const fingerprint = HDKey.fromExtendedKey(xpub).fingerprint;
  return fingerprint.toString(16).padStart(8, "0");
}

/**
 * Derive the EVM address a full derivation path resolves to under an extended
 * public key. The xpub is the account node; the relative part of `path` past
 * the xpub's depth is derived from it. Returns the lowercase hex address, or
 * throws when the path can't be derived from the xpub (e.g. hardened relative
 * segments or a path shallower than the xpub).
 */
export function evmAddressFromXpub(xpub: string, path: string): string {
  const root = HDKey.fromExtendedKey(xpub);
  const segments = path
    .replace(/^[mM]'?\/?/, "")
    .split("/")
    .filter(Boolean);
  const relative = segments.slice(root.depth);
  const node = relative.length > 0 ? root.derive(`m/${relative.join("/")}`) : root;
  if (!node.publicKey) throw new Error("Failed to derive public key from xpub");
  const uncompressed = secp256k1.Point.fromHex(bytesToHex(node.publicKey)).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`;
}
