import { signTransactionWithDetachedSignature } from "@slothsign/chain-solana";
import type { SignerMode } from "./types.ts";

const DETACHED_SIGNATURE_BYTES = 64;

/**
 * Turn a submitted Solana transaction result into the signed transaction.
 * keystone-qr always returns a detached signature. address-qr returns either
 * the full signed transaction (pasted from the CLI) or a detached signature
 * (scanned from the phone); a serialized transaction is always longer than 64
 * bytes, so the length tells them apart.
 */
export function signedSolanaTransaction(
  signer: SignerMode,
  serialized: Uint8Array,
  result: Uint8Array,
  address: string,
): Uint8Array {
  const detached =
    signer === "keystone-qr" ||
    (signer === "address-qr" && result.length === DETACHED_SIGNATURE_BYTES);
  return detached ? signTransactionWithDetachedSignature(serialized, result, address) : result;
}
