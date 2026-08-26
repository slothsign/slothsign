import { UR, URDecoder, UREncoder } from "@ngraveio/bc-ur";
import {
  CryptoHDKey,
  CryptoKeypath,
  PathComponent,
  RegistryTypes,
} from "@keystonehq/bc-ur-registry";
import { DataType, ETHSignature, EthSignRequest } from "@keystonehq/bc-ur-registry-eth";
import { SolSignRequest, SignType, SolSignature } from "@keystonehq/bc-ur-registry-sol";
import { PublicKey } from "@solana/web3.js";
import { encode } from "borc";
import {
  isTypedTransaction,
  payloadToMessage as evmPayloadToMessage,
  payloadToTx,
  payloadToTypedData,
  serializeEvmTransaction,
} from "@slothsign/chain-evm";
import {
  base64ToBytes,
  bytesToBase64,
  payloadToMessage as solanaPayloadToMessage,
  payloadToTransactionBytes,
} from "@slothsign/chain-solana";
import { fingerprintFromXpub } from "@slothsign/keystore";
import type { SignerRequest } from "@slothsign/core";
import { bytesToHex } from "viem";
import {
  normalizeEvmPath,
  DEFAULT_EVM_PATH,
  DEFAULT_SOLANA_PATH,
  type WalletConfig,
} from "./config.ts";
import type { SignPendingRequest } from "./requestStore.ts";
import { encodeDataItem } from "./ur-cbor.ts";

const ETH_SIGNATURE_UR = "eth-signature";
const SOL_SIGNATURE_UR = "sol-signature";

/** UR type wrapping the sloth://req transport for address-qr signing. */
const SLOTH_SIGN_REQUEST_UR = "sloth-sign-request";

/** QR fragment capacity for the animated fountain-encoded UR. */
const FRAGMENT_BYTES = 256;

export interface RequestUrParts {
  /** QR payloads, one per animation frame. A single item renders a static QR. */
  parts: string[];
  /** Copy fallback (the sloth://req/… transport string). */
  fallback: string;
}

/**
 * Build the QR frames for a QR-signing request.
 *
 * keystone-qr uses animated BC-URs (eth-sign-request / sol-sign-request) that
 * AirGap Vault / Keystone can scan; address-qr wraps the sloth://req transport
 * in an animated BC-UR (sloth-sign-request) so payloads of any size fit.
 */
export function buildRequestParts(
  request: SignPendingRequest,
  wallet: WalletConfig | undefined,
): RequestUrParts {
  if (request.chain === "ethereum") return buildEvmRequestParts(request, wallet);
  return buildSolanaRequestParts(request, wallet);
}

function buildEvmRequestParts(request: SignPendingRequest, wallet: WalletConfig | undefined) {
  const signerRequest = request.signerRequest;
  if (!signerRequest) throw new Error("SlothSign: missing signer request");
  const ur =
    request.signer === "address-qr"
      ? new UR(encode(request.transport ?? ""), SLOTH_SIGN_REQUEST_UR)
      : buildKeystoneRequestUr(signerRequest, wallet);
  return { parts: encodeParts(ur), fallback: request.transport ?? "" };
}

function buildSolanaRequestParts(request: SignPendingRequest, wallet: WalletConfig | undefined) {
  const signerRequest = request.signerRequest;
  if (!signerRequest) throw new Error("SlothSign: missing signer request");
  const ur =
    request.signer === "address-qr"
      ? new UR(encode(request.transport ?? ""), SLOTH_SIGN_REQUEST_UR)
      : buildSolanaKeystoneRequestUr(signerRequest, wallet);
  return { parts: encodeParts(ur), fallback: request.transport ?? "" };
}

function buildSolanaKeystoneRequestUr(
  signerRequest: SignerRequest,
  wallet: WalletConfig | undefined,
): UR {
  const { signData, signType } = solanaSignData(signerRequest);
  const path = (wallet?.path || DEFAULT_SOLANA_PATH).trim();
  const addressBytes = solanaAddressBytes(signerRequest.address);
  const solSignRequest = new SolSignRequest({
    requestId: uuidToBytes(crypto.randomUUID()),
    signData: Buffer.from(signData),
    derivationPath: solanaKeypath(path),
    address: addressBytes,
    signType,
  });
  const cbor = encodeDataItem(solSignRequest.toDataItem());
  return new UR(cbor, solSignRequest.getRegistryType().getType());
}

function solanaSignData(signerRequest: SignerRequest) {
  switch (signerRequest.type) {
    case "transaction": {
      return {
        signData: payloadToTransactionBytes(signerRequest.payload),
        signType: SignType.Transaction,
      };
    }
    case "message": {
      const { message } = solanaPayloadToMessage(signerRequest.payload);
      return {
        signData: base64ToBytes(message),
        signType: SignType.Message,
      };
    }
    case "typedData": {
      throw new Error("Solana does not support typed data");
    }
  }
}

/** Convert a base58 Solana address into its raw 32-byte public key. */
function solanaAddressBytes(address: string): Buffer | undefined {
  try {
    return Buffer.from(new PublicKey(address).toBytes());
  } catch {
    return undefined;
  }
}

/** Build a CryptoKeypath (BC-UR 304) from a BIP-32 path like m/44'/501'/0'/0'. */
function solanaKeypath(path: string): CryptoKeypath {
  const components = path
    .replace(/^[mM]\//, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const hardened = segment.endsWith("'");
      const index = parseInt(segment.replace("'", ""), 10);
      return new PathComponent({ index, hardened });
    });
  return new CryptoKeypath(components);
}

/** Encode a UUID string into its 16 raw bytes for a keystone requestId. */
function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function buildKeystoneRequestUr(
  signerRequest: SignerRequest,
  wallet: WalletConfig | undefined,
): UR {
  const { signData, dataType } = evmSignData(signerRequest);
  if (!wallet?.xpub) {
    throw new Error(
      "SlothSign: extended public key (xpub) is required for keystone-qr EVM wallets",
    );
  }
  const ethSignRequest = EthSignRequest.constructETHRequest(
    Buffer.from(signData, "hex"),
    dataType,
    normalizeEvmPath(wallet?.path),
    fingerprintFromXpub(wallet.xpub),
    crypto.randomUUID(),
    Number(BigInt(signerRequest.chainId)),
    wallet?.address,
    undefined,
  );
  const cbor = encodeDataItem(ethSignRequest.toDataItem());
  return new UR(cbor, ethSignRequest.getRegistryType().getType());
}

function evmSignData(signerRequest: SignerRequest) {
  switch (signerRequest.type) {
    case "transaction": {
      const tx = payloadToTx(signerRequest.payload);
      return {
        signData: serializeEvmTransaction(tx, signerRequest.chainId),
        dataType: isTypedTransaction(tx) ? DataType.typedTransaction : DataType.transaction,
      };
    }
    case "message": {
      const { message } = evmPayloadToMessage(signerRequest.payload);
      return {
        signData: messageToSignData(message),
        dataType: DataType.personalMessage,
      };
    }
    case "typedData": {
      const { typedData } = payloadToTypedData(signerRequest.payload);
      const json = JSON.stringify(typedData);
      return {
        signData: bytesToHex(new TextEncoder().encode(json)).slice(2),
        dataType: DataType.typedData,
      };
    }
  }
}

export { evmSerializable } from "@slothsign/chain-evm";

function messageToSignData(message: string): string {
  const hex = message.startsWith("0x") ? message.slice(2) : message;
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) return hex.toLowerCase();
  return bytesToHex(new TextEncoder().encode(message)).slice(2);
}

function encodeParts(ur: UR): string[] {
  return new UREncoder(ur, FRAGMENT_BYTES).encodeWhole();
}

/**
 * Decode a scanned/pasted signature into the chain-specific signing result.
 * Accepts a BC-UR payload (`ur:…`, eth-signature / sol-signature); anything
 * else (e.g. a legacy sloth://sig/… string) passes through unchanged.
 */
export function decodeSignature(text: string, chain: "ethereum" | "solana"): unknown {
  const value = text.trim();
  const decoder = new URDecoder();
  decoder.receivePart(value.toLowerCase());
  if (!decoder.isComplete() || !decoder.isSuccess()) return value;
  const ur = decoder.resultUR();
  if (chain === "ethereum") {
    if (ur.type !== ETH_SIGNATURE_UR) {
      throw new Error(`Unexpected QR type: ${ur.type}`);
    }
    const { signature } = parseEthSignature(ur);
    return `0x${signature}`;
  }
  if (ur.type !== SOL_SIGNATURE_UR) {
    throw new Error(`Unexpected QR type: ${ur.type}`);
  }
  const { signature } = parseSolSignature(ur);
  return bytesToBase64(signature);
}

function parseEthSignature(ur: UR): {
  requestId?: string;
  signature: string;
  origin?: string;
} {
  const sig = ETHSignature.fromCBOR(ur.cbor);
  const requestId = sig.getRequestId();
  return {
    requestId: requestId === undefined ? undefined : uuidStringify(requestId),
    signature: sig.getSignature().toString("hex"),
    origin: sig.getOrigin(),
  };
}

function parseSolSignature(ur: UR): { requestId?: string; signature: Uint8Array } {
  const sig = SolSignature.fromCBOR(ur.cbor);
  const requestId = sig.getRequestId();
  return {
    requestId: requestId === undefined ? undefined : uuidStringify(requestId),
    signature: sig.getSignature(),
  };
}

function uuidStringify(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Decode a scanned AirGap xpub QR (`ur:crypto-hdkey/…`) into the serialized
 * extended public key string.
 */
export function decodeXpub(text: string): string {
  return decodeAirGapKey(text).xpub;
}

/**
 * Decode a scanned AirGap xpub QR (`ur:crypto-hdkey/…`) into its parts: the
 * serialized extended public key, the derivation path (with `m/` prefix), and
 * an optional name/label.
 */
export function decodeAirGapKey(text: string): { xpub: string; path?: string; name?: string } {
  const decoder = new URDecoder();
  decoder.receivePart(text);
  if (!decoder.isComplete() || !decoder.isSuccess()) {
    throw new Error("Incomplete or invalid QR data");
  }
  const ur = decoder.resultUR();
  if (ur.type !== RegistryTypes.CRYPTO_HDKEY.getType()) {
    throw new Error(`Unexpected QR type: ${ur.type}`);
  }
  const hdKey = CryptoHDKey.fromCBOR(ur.cbor);
  const xpub = hdKey.getBip32Key();
  if (!xpub) throw new Error("No public key found in QR");
  const origin = hdKey.getOrigin()?.getPath();
  const children = hdKey.getChildren()?.getPath();
  const segments = [origin, children].filter(Boolean);
  return {
    xpub,
    path: segments.length > 0 ? `m/${segments.join("/")}` : undefined,
    name: hdKey.getName(),
  };
}

/**
 * Convert the account-level path from an AirGap xpub QR (e.g. `m/44'/60'/0'`)
 * into a full receiving-address wallet path (`m/44'/60'/0'/0/0`), padding with
 * the default change/address index when the QR only exports the account root.
 */
export function walletPathFromAirGap(path: string | undefined): string {
  const segments = (path ?? DEFAULT_EVM_PATH)
    .replace(/^[mM]\/?/, "")
    .split("/")
    .filter(Boolean);
  const missing = Math.max(0, 5 - segments.length);
  return `m/${[...segments, ...Array(missing).fill("0")].join("/")}`;
}
