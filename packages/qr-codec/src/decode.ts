import { decodeRequest, isSignerRequest, type SignerRequest } from "@slothsign/core";
import { EthSignRequest } from "@keystonehq/bc-ur-registry-eth";
import { SolSignRequest } from "@keystonehq/bc-ur-registry-sol";
import { URDecoder, UR } from "@ngraveio/bc-ur";
import { decode } from "borc";
import { base58 } from "@scure/base";

export interface KeystoneEthereumRequest {
  kind: "keystone";
  chain: "ethereum";
  requestId?: string;
  signData: Uint8Array;
  dataType: number;
  path: string;
  chainId?: number;
  address?: string;
  origin?: string;
}

export interface KeystoneSolanaRequest {
  kind: "keystone";
  chain: "solana";
  requestId?: string;
  signData: Uint8Array;
  signType: number;
  path: string;
  address?: string;
  origin?: string;
}

export type DecodedRequest =
  | { kind: "signer"; request: SignerRequest }
  | KeystoneEthereumRequest
  | KeystoneSolanaRequest;

function uuidStringify(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizePath(path: string | undefined): string {
  if (!path) return "";
  return path.startsWith("m/") ? path : `m/${path}`;
}

function decodeSlothUr(ur: UR): DecodedRequest {
  const transport = decode(ur.cbor) as string;
  const request = decodeRequest(transport);
  if (!request) throw new Error("Invalid sloth-sign-request transport");
  return { kind: "signer", request };
}

function decodeEthUr(ur: UR): KeystoneEthereumRequest {
  const ethSignRequest = EthSignRequest.fromCBOR(ur.cbor);
  const signData = ethSignRequest.getSignData();
  const dataType = ethSignRequest.getDataType();
  const path = normalizePath(ethSignRequest.getDerivationPath());
  const chainId = ethSignRequest.getChainId();
  const addressBuf = ethSignRequest.getSignRequestAddress();
  const requestIdBuf = ethSignRequest.getRequestId();
  const origin = ethSignRequest.getOrigin();

  return {
    kind: "keystone",
    chain: "ethereum",
    requestId: requestIdBuf ? uuidStringify(requestIdBuf) : undefined,
    signData: Buffer.isBuffer(signData) ? signData : new Uint8Array(signData),
    dataType,
    path,
    chainId: chainId ?? undefined,
    address: addressBuf ? `0x${Buffer.from(addressBuf).toString("hex")}` : undefined,
    origin: origin ?? undefined,
  };
}

function decodeSolUr(ur: UR): KeystoneSolanaRequest {
  const solSignRequest = SolSignRequest.fromCBOR(ur.cbor);
  const signData = solSignRequest.getSignData();
  const signType = solSignRequest.getSignType();
  const path = normalizePath(solSignRequest.getDerivationPath());
  const addressBuf = solSignRequest.getSignRequestAddress();
  const requestIdBuf = solSignRequest.getRequestId();
  const origin = solSignRequest.getOrigin();

  let address: string | undefined;
  if (addressBuf && addressBuf.length === 32) {
    address = base58.encode(new Uint8Array(addressBuf));
  }

  return {
    kind: "keystone",
    chain: "solana",
    requestId: requestIdBuf ? uuidStringify(requestIdBuf) : undefined,
    signData: Buffer.isBuffer(signData) ? signData : new Uint8Array(signData),
    signType,
    path,
    address,
    origin: origin ?? undefined,
  };
}

function decodeUr(text: string): DecodedRequest {
  const ur = URDecoder.decode(text);
  switch (ur.type) {
    case "sloth-sign-request":
      return decodeSlothUr(ur);
    case "eth-sign-request":
      return decodeEthUr(ur);
    case "sol-sign-request":
      return decodeSolUr(ur);
    default:
      throw new Error(`Unsupported UR type: ${ur.type}`);
  }
}

export function decodeRequestText(text: string): DecodedRequest {
  const trimmed = text.trim();
  if (trimmed.startsWith("sloth://req/")) {
    const request = decodeRequest(trimmed);
    if (!request) throw new Error("Invalid sloth://req/ transport");
    return { kind: "signer", request };
  }
  if (trimmed.startsWith("ur:")) {
    return decodeUr(trimmed);
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (isSignerRequest(parsed)) {
      return { kind: "signer", request: parsed };
    }
  } catch {}
  throw new Error("Unable to decode request text");
}
