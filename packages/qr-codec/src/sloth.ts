import { UR, UREncoder } from "@ngraveio/bc-ur";
import { decodeRequest, decodeResult, type SignerRequest } from "@slothsign/core";
import { decode, encode } from "borc";

// This entry point must stay free of the Keystone registries: they need Node's
// `crypto`, which React Native does not provide.

export const SLOTH_REQUEST_UR = "sloth-sign-request";
export const SLOTH_RESULT_UR = "sloth-sign-result";

function transportFromUr(ur: UR, type: string): string {
  if (ur.type !== type) throw new Error(`Unexpected QR type: ${ur.type}`);
  const transport: unknown = decode(ur.cbor);
  if (typeof transport !== "string") throw new Error(`Invalid ${type} payload`);
  return transport;
}

/** Decode a completed `sloth-sign-request` UR into its request. */
export function decodeSlothRequestUr(ur: UR): SignerRequest {
  return decodeRequest(transportFromUr(ur, SLOTH_REQUEST_UR));
}

/** Wrap a `sloth://sig/…` transport string in a single-part `sloth-sign-result` UR. */
export function encodeSlothResultUr(transport: string): string {
  decodeResult(transport);
  return UREncoder.encodeSinglePart(new UR(encode(transport), SLOTH_RESULT_UR));
}

/** Decode a completed `sloth-sign-result` UR into its `sloth://sig/…` transport string. */
export function decodeSlothResultUr(ur: UR): string {
  const transport = transportFromUr(ur, SLOTH_RESULT_UR);
  decodeResult(transport);
  return transport;
}
