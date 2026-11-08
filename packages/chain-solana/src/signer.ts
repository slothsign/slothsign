import { Transaction, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { deriveSolanaPrivateKey } from "@slothsign/keystore";
import { base64ToBytes } from "./payload.ts";

/**
 * An ed25519 key held in memory. web3.js's Keypair needs WebCrypto Ed25519,
 * which Hermes lacks, so signing here stays in JS on every platform.
 */
export interface SolanaKeypair {
  publicKey: PublicKey;
  /** seed || public key, 64 bytes. */
  secretKey: Uint8Array;
}

function keypairFromSeed(seed: Uint8Array): SolanaKeypair {
  const publicKey = ed25519.getPublicKey(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed);
  secretKey.set(publicKey, 32);
  return { publicKey: new PublicKey(publicKey), secretKey };
}

function signBytes(keypair: SolanaKeypair, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, keypair.secretKey.slice(0, 32));
}

/**
 * Derive a keypair from a mnemonic at a SLIP-0010 ed25519 path (the standard
 * derivation used by Trezor, Ledger and solana-keygen).
 */
export function keypairFromMnemonic(
  mnemonic: string,
  path = "m/44'/501'/0'/0'",
  passphrase = "",
): SolanaKeypair {
  return keypairFromSeed(deriveSolanaPrivateKey(mnemonic, path, passphrase));
}

/**
 * Build a keypair from a raw secret. Accepts either a 64-byte base58 secret
 * key (Phantom-style export: seed || public key) or a 32-byte base58 seed.
 */
export function keypairFromSecret(secret: string): SolanaKeypair {
  const decoded = bs58Decode(secret);
  if (decoded.length === 32) return keypairFromSeed(decoded);
  if (decoded.length === 64) {
    const keypair = keypairFromSeed(decoded.slice(0, 32));
    if (!keypair.secretKey.every((byte, index) => byte === decoded[index])) {
      throw new Error("Invalid Solana secret: public key does not match the seed");
    }
    return keypair;
  }
  throw new Error("Invalid Solana secret: expected 32-byte seed or 64-byte secret key (base58)");
}

function bs58Decode(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const result: number[] = [0];
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit === -1) throw new Error("Invalid base58 character");
    let carry = digit;
    for (let i = 0; i < result.length; i++) {
      carry += result[i]! * 58;
      result[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      result.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < value.length && value[i] === "1"; i++) result.push(0);
  return Uint8Array.from(result.reverse());
}

export function isValidSecretKey(secret: string): boolean {
  try {
    const decoded = bs58Decode(secret);
    return decoded.length === 32 || decoded.length === 64;
  } catch {
    return false;
  }
}

function signLegacyTransaction(
  keypair: SolanaKeypair,
  serializedTransaction: Uint8Array,
): Transaction {
  const tx = Transaction.from(serializedTransaction);
  tx.addSignature(keypair.publicKey, signBytes(keypair, tx.serializeMessage()));
  return tx;
}

/** Serialize a legacy transaction, refusing a missing or invalid signature. */
function serializeVerified(tx: Transaction): Promise<Uint8Array> {
  const message = tx.serializeMessage();
  for (const { publicKey, signature } of tx.signatures) {
    if (!signature || !ed25519.verify(signature, message, publicKey.toBytes())) {
      throw new Error(`Signature verification failed for ${publicKey.toBase58()}`);
    }
  }
  return tx.serialize({ verifySignatures: false });
}

/**
 * Sign a serialized Solana transaction with the given keypair.
 * Auto-detects legacy vs versioned transactions.
 * Returns the serialized signed transaction.
 */
export async function signTransaction(
  keypair: SolanaKeypair,
  serializedTransaction: Uint8Array,
): Promise<Uint8Array> {
  if (isVersionedTransaction(serializedTransaction)) {
    return signVersionedTransaction(keypair, serializedTransaction);
  }
  return serializeVerified(signLegacyTransaction(keypair, serializedTransaction));
}

/**
 * Sign a versioned (0x80-prefixed) serialized Solana transaction.
 * Returns the serialized signed transaction.
 */
export function signVersionedTransaction(
  keypair: SolanaKeypair,
  serializedTransaction: Uint8Array,
): Uint8Array {
  const tx = VersionedTransaction.deserialize(serializedTransaction);
  tx.addSignature(keypair.publicKey, signBytes(keypair, tx.message.serialize()));
  return tx.serialize();
}

/**
 * Detached ed25519 signature over raw message bytes.
 * Solana secret keys are 64 bytes (seed || public); ed25519 signs with the 32-byte seed.
 */
export async function signMessage(
  keypair: SolanaKeypair,
  message: Uint8Array,
): Promise<Uint8Array> {
  return signBytes(keypair, message);
}

/**
 * Detached 64-byte ed25519 signature over a serialized transaction's message,
 * as required by a keystone sol-sign-request. Signs the transaction in place
 * (legacy or versioned) and extracts the resulting signature bytes without
 * returning the re-serialized transaction.
 */
export function signTransactionDetached(
  keypair: SolanaKeypair,
  serializedTransaction: Uint8Array,
): Uint8Array {
  if (isVersionedTransaction(serializedTransaction)) {
    const tx = VersionedTransaction.deserialize(serializedTransaction);
    tx.addSignature(keypair.publicKey, signBytes(keypair, tx.message.serialize()));
    const signature = tx.signatures[0];
    if (!signature) throw new Error("Solana versioned transaction produced no signature");
    return signature;
  }
  const signature = signLegacyTransaction(keypair, serializedTransaction).signatures[0]?.signature;
  if (!signature) throw new Error("Solana legacy transaction produced no signature");
  return signature;
}

/**
 * Inject a detached 64-byte ed25519 signature (e.g. from a keystone sol-signature
 * QR) into a serialized transaction for the given signer public key.
 * Auto-detects legacy vs versioned transactions. Returns the re-serialized
 * signed transaction.
 */
export async function signTransactionWithDetachedSignature(
  serializedTransaction: Uint8Array,
  signature: Uint8Array,
  publicKey: string,
): Promise<Uint8Array> {
  if (signature.length !== 64) throw new Error("Solana detached signature must be 64 bytes");
  if (isVersionedTransaction(serializedTransaction)) {
    const tx = VersionedTransaction.deserialize(serializedTransaction);
    tx.addSignature(new PublicKey(publicKey), signature);
    return tx.serialize();
  }
  const tx = Transaction.from(serializedTransaction);
  tx.addSignature(new PublicKey(publicKey), signature);
  return serializeVerified(tx);
}

export function signMessageFromPayload(
  keypair: SolanaKeypair,
  payload: string,
): Promise<Uint8Array> {
  const { message } = JSON.parse(payload) as { message: string };
  return signMessage(keypair, base64ToBytes(message));
}

/** Read a compact-u16 from the start of a buffer. Returns the value and byte length. */
function readCompactU16(bytes: Uint8Array, offset: number): { value: number; length: number } {
  const b0 = bytes[offset];
  if (b0 === undefined) return { value: 0, length: 0 };
  if (b0 < 128) return { value: b0, length: 1 };
  const b1 = bytes[offset + 1];
  if (b1 === undefined) return { value: b0, length: 1 };
  if (b1 < 128) return { value: ((b0 & 0x7f) << 8) | b1, length: 2 };
  const b2 = bytes[offset + 2];
  if (b2 === undefined) return { value: ((b0 & 0x7f) << 8) | b1, length: 2 };
  return { value: ((b0 & 0x7f) << 16) | ((b1 & 0x7f) << 8) | b2, length: 3 };
}

export function isVersionedTransaction(serialized: Uint8Array): boolean {
  const { value: numSigs, length: sigLen } = readCompactU16(serialized, 0);
  const messageOffset = sigLen + numSigs * 64;
  const versionByte = serialized[messageOffset];
  return versionByte !== undefined && (versionByte & 0x80) === 0x80;
}
