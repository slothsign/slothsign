import { Connection, Transaction, VersionedTransaction, type Commitment } from "@solana/web3.js";
import { isVersionedTransaction } from "./signer.ts";

/**
 * Options for broadcasting a signed Solana transaction, mirroring the
 * wallet-standard `solana:signAndSendTransaction` options.
 */
export interface SolanaBroadcastOptions {
  /** Desired commitment level. If provided, confirm the transaction after sending. */
  commitment?: "processed" | "confirmed" | "finalized";
  /** Disable transaction verification at the RPC. */
  skipPreflight?: boolean;
  /** Maximum number of times for the RPC node to retry sending the transaction. */
  maxRetries?: number;
}

/**
 * Broadcast a fully-signed Solana transaction to the given RPC endpoint and
 * return its transaction signature (base58).
 */
export async function broadcastTransaction(
  rpcUrl: string,
  signedTransaction: Uint8Array,
  options?: SolanaBroadcastOptions,
): Promise<string> {
  const connection = new Connection(rpcUrl, (options?.commitment ?? "confirmed") as Commitment);
  return connection.sendRawTransaction(signedTransaction, {
    skipPreflight: options?.skipPreflight,
    maxRetries: options?.maxRetries,
    preflightCommitment: options?.commitment as Commitment | undefined,
  });
}

/**
 * Extract the first (account) ed25519 signature from a fully-signed Solana
 * transaction. Auto-detects legacy vs versioned transactions.
 */
export function extractSignature(signedTransaction: Uint8Array): Uint8Array {
  if (isVersionedTransaction(signedTransaction)) {
    const tx = VersionedTransaction.deserialize(signedTransaction);
    const signature = tx.signatures[0];
    if (!signature) throw new Error("Solana signed transaction produced no signature");
    return signature;
  }
  const tx = Transaction.from(signedTransaction);
  const signature = tx.signatures[0]?.signature;
  if (!signature) throw new Error("Solana signed transaction produced no signature");
  return signature;
}
