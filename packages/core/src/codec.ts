import { sha256 } from "@noble/hashes/sha2.js";
import type { Chain } from "./account.ts";
import type { SignerRequest } from "./signerRequest.ts";
import { isSignerRequest } from "./signerRequest.ts";

export const PROTOCOL = "sloth";
export const REQUEST_PREFIX = "sloth://req/";
export const RESULT_PREFIX = "sloth://sig/";

/**
 * base64url codec that works in both browsers (btoa/atob) and Node.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeRequest(request: SignerRequest): string {
  const json = JSON.stringify(request);
  return (
    REQUEST_PREFIX +
    bytesToBase64Url(new TextEncoder().encode(json)) +
    "." +
    requestFingerprint(json)
  );
}

/**
 * Short integrity fingerprint (first 4 bytes of SHA-256, hex) of the request
 * JSON. Appended to the encoded request string so users can verify a copied
 * request by comparing the tail.
 */
export function requestFingerprint(json: string): string {
  const digest = sha256(new TextEncoder().encode(json));
  return Array.from(digest.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function decodeRequest(text: string): SignerRequest {
  if (!text.startsWith(REQUEST_PREFIX)) {
    throw new Error(`Invalid signer request: missing ${REQUEST_PREFIX} prefix`);
  }
  const encoded = text.slice(REQUEST_PREFIX.length);
  const dot = encoded.lastIndexOf(".");
  if (dot < 0) {
    throw new Error("Invalid signer request: missing fingerprint");
  }
  const payload = encoded.slice(0, dot);
  const fingerprint = encoded.slice(dot + 1);
  const json = new TextDecoder().decode(base64UrlToBytes(payload));
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid signer request: malformed JSON");
  }
  if (!isSignerRequest(parsed)) {
    throw new Error("Invalid signer request: schema mismatch");
  }
  if (requestFingerprint(json) !== fingerprint) {
    throw new Error("Invalid signer request: fingerprint mismatch");
  }
  return parsed;
}

export interface SignerResult<T = unknown> {
  chain: Chain;
  /** chain-specific signature (EVM sig hex, Solana signed tx bytes) */
  result: T;
}

export function encodeResult(result: SignerResult): string {
  const json = JSON.stringify(result);
  return RESULT_PREFIX + bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeResult<T = unknown>(text: string): SignerResult<T> {
  if (!text.startsWith(RESULT_PREFIX)) {
    throw new Error(`Invalid signer result: missing ${RESULT_PREFIX} prefix`);
  }
  const encoded = text.slice(RESULT_PREFIX.length);
  const json = new TextDecoder().decode(base64UrlToBytes(encoded));
  let parsed: { chain?: unknown; result?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid signer result: malformed JSON");
  }
  if (parsed.chain !== "ethereum" && parsed.chain !== "solana") {
    throw new Error("Invalid signer result: unknown chain");
  }
  return parsed as SignerResult<T>;
}
