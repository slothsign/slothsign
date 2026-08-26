import { describe, expect, test } from "bun:test";
import { URDecoder } from "@ngraveio/bc-ur";
import { decodeToDataItem } from "@keystonehq/bc-ur-registry";
import { EthSignRequest } from "@keystonehq/bc-ur-registry-eth";
import { buildRequestParts } from "../src/lib/keystone.ts";
import {
  RABBY_CBOR_HEX,
  RABBY_FIELD_KEYS,
  RABBY_PARTS,
  RABBY_REQUEST,
} from "./fixtures/rabby-request.ts";
import { buildRequest, WALLET } from "./fixtures/uniswap-request.ts";

function decodeParts(parts: string[]): { cborHex: string; req: EthSignRequest } {
  const decoder = new URDecoder();
  for (const part of parts) decoder.receivePart(part);
  expect(decoder.isComplete()).toBe(true);
  expect(decoder.isSuccess()).toBe(true);
  const ur = decoder.resultUR();
  expect(ur.type).toBe("eth-sign-request");
  return { cborHex: ur.cbor.toString("hex"), req: EthSignRequest.fromCBOR(ur.cbor) };
}

function fieldKeys(parts: string[]): string[] {
  const decoder = new URDecoder();
  for (const part of parts) decoder.receivePart(part);
  const map = decodeToDataItem(decoder.resultUR().cbor).getData();
  return Object.keys(map).sort();
}

describe("Rabby Wallet captured eth-sign-request (known-good reference)", () => {
  test("captured parts reassemble to the exact captured CBOR bytes", () => {
    expect(decodeParts(RABBY_PARTS).cborHex).toBe(RABBY_CBOR_HEX);
  });

  test("decoded request metadata matches the captured values", () => {
    const { req } = decodeParts(RABBY_PARTS);
    expect(req.getRequestId()?.toString("hex")).toBe(RABBY_REQUEST.requestId);
    expect(req.getSignRequestAddress()?.toString("hex")).toBe(RABBY_REQUEST.address.slice(2));
    expect(req.getDerivationPath()).toBe(RABBY_REQUEST.derivationPath);
    expect(req.getSourceFingerprint()?.toString("hex")).toBe(RABBY_REQUEST.sourceFingerprint);
    expect(req.getChainId()).toBe(RABBY_REQUEST.chainId);
    expect(req.getDataType()).toBe(RABBY_REQUEST.dataType);
    expect(req.getSignData().length).toBe(RABBY_REQUEST.signDataLen);
    expect(req.getSignData().toString("hex").slice(0, RABBY_REQUEST.signDataHead.length)).toBe(
      RABBY_REQUEST.signDataHead,
    );
  });

  test("Rabby's request carries the address field (6) and no origin (7)", () => {
    const keys = fieldKeys(RABBY_PARTS);
    expect(keys).toContain("6");
    expect(keys).not.toContain("7");
    expect(decodeParts(RABBY_PARTS).req.getOrigin()).toBeUndefined();
  });
});

describe("our output matches Rabby's request shape (regression for AirGap fix)", () => {
  const { parts } = buildRequestParts(buildRequest(), WALLET);
  const { req } = decodeParts(parts);

  test("includes the signer address field (6) Rabby sends", () => {
    expect(req.getSignRequestAddress()?.toString("hex")).toBe(RABBY_REQUEST.address.slice(2));
    expect(req.getSignRequestAddress()?.length).toBe(20);
    expect(Buffer.isBuffer(req.getSignRequestAddress())).toBe(true);
  });

  test("carries every field Rabby's request carries, and no origin (7)", () => {
    const keys = fieldKeys(parts);
    for (const key of RABBY_FIELD_KEYS) {
      expect(keys, `field ${key}`).toContain(key);
    }
    expect(keys).not.toContain("7");
    expect(req.getOrigin()).toBeUndefined();
  });
});
