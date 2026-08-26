import {
  keccak256,
  serializeTransaction,
  toHex,
  type Address,
  type Hash,
  type Hex,
  type TransactionRequest,
  type TransactionSerializable,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type EvmTransactionPayload } from "./payload.ts";
import { evmSerializable } from "./serialize.ts";

export type PrivateKey = `0x${string}`;

/**
 * Sign an EVM transaction. Returns the raw signed transaction (not broadcast).
 */
export async function signTransaction(
  privateKey: PrivateKey,
  transaction: TransactionRequest,
  chainId: number,
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  const tx = { ...transaction, chainId } as TransactionSerializable & { chainId: number };
  return account.signTransaction(tx);
}

/**
 * Sign an EVM transaction payload (from a SignerRequest) and return the raw
 * signature hex (r/s/v). The extension reassembles and broadcasts the full
 * serialized transaction itself, so only the signature is produced here.
 */
export async function signEvmSignature(
  privateKey: PrivateKey,
  payload: EvmTransactionPayload,
  chainId: string,
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  const serializable = evmSerializable(payload, chainId);
  const hash = keccak256(serializeTransaction(serializable));
  return account.sign({ hash });
}

export async function signMessage(privateKey: PrivateKey, message: string): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  const raw = isHexMessage(message);
  return account.signMessage({ message: raw ? { raw: message as Hex } : message });
}

/**
 * Sign a raw RLP-serialized transaction (as carried by a keystone eth-sign-request
 * UR) and return the detached 65-byte r/s/v signature. Only the keccak digest of
 * the serialized bytes is signed.
 */
export async function signSerializedTransaction(
  privateKey: PrivateKey,
  serialized: Uint8Array,
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  const hash = keccak256(serialized);
  return account.sign({ hash });
}

/**
 * Sign raw message bytes with EIP-191 (the personalMessage data type of a
 * keystone eth-sign-request UR) and return the detached 65-byte r/s/v signature.
 */
export async function signMessageBytes(privateKey: PrivateKey, message: Uint8Array): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  return account.signMessage({ message: { raw: toHex(message) } });
}

/**
 * Sign EIP-712 typed data given as raw JSON bytes (the typedData data type of a
 * keystone eth-sign-request UR) and return the detached 65-byte r/s/v signature.
 */
export async function signTypedDataBytes(
  privateKey: PrivateKey,
  jsonBytes: Uint8Array,
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  const typedData = JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<string, unknown>;
  return account.signTypedData(typedData as TypedDataDefinition);
}

export async function signTypedData(
  privateKey: PrivateKey,
  typedData: Record<string, unknown>,
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  return account.signTypedData(typedData as TypedDataDefinition);
}

export function addressFromPrivateKey(privateKey: PrivateKey): Address {
  return privateKeyToAccount(privateKey).address;
}

/** EIP-191 personal_sign treats a 0x hex string as raw bytes, not UTF-8 text. */
function isHexMessage(message: string): boolean {
  if (!message.startsWith("0x")) return false;
  return /^[0-9a-fA-F]+$/.test(message.slice(2));
}
