import { UR, UREncoder } from "@ngraveio/bc-ur";
import { ETHSignature } from "@keystonehq/bc-ur-registry-eth";
import { SolSignature } from "@keystonehq/bc-ur-registry-sol";
import { encodeDataItem } from "./cbor.ts";

const ETH_SIGNATURE_UR = "eth-signature";
const SOL_SIGNATURE_UR = "sol-signature";
const FRAGMENT_BYTES = 256;

function uuidToBytes(uuid: string | undefined): Buffer | undefined {
  if (!uuid) return undefined;
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}

/**
 * Encode a signature into the single-part BC-UR string a Keystone/AirGap
 * signature scanner (or the extension's `decodeSignature`) accepts.
 * EVM signatures are the 65-byte r/s/v blob; Solana the detached 64-byte
 * Ed25519 signature.
 */
export function encodeKeystoneSignature(
  chain: "ethereum" | "solana",
  signature: Uint8Array,
  requestId?: string,
  origin?: string,
): string {
  const ur =
    chain === "ethereum"
      ? buildEthSignatureUr(signature, requestId, origin)
      : buildSolSignatureUr(signature, requestId);
  return UREncoder.encodeSinglePart(ur);
}

function buildEthSignatureUr(signature: Uint8Array, requestId?: string, origin?: string): UR {
  const ethSignature = new ETHSignature(Buffer.from(signature), uuidToBytes(requestId), origin);
  const cbor = encodeDataItem(ethSignature.toDataItem());
  return new UR(cbor, ETH_SIGNATURE_UR);
}

function buildSolSignatureUr(signature: Uint8Array, requestId?: string): UR {
  const solSignature = new SolSignature(Buffer.from(signature), uuidToBytes(requestId));
  const cbor = encodeDataItem(solSignature.toDataItem());
  return new UR(cbor, SOL_SIGNATURE_UR);
}

export { FRAGMENT_BYTES };
