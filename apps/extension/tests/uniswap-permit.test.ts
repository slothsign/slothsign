import { describe, expect, test } from "bun:test";
import { URDecoder } from "@ngraveio/bc-ur";
import { decodeToDataItem } from "@keystonehq/bc-ur-registry";
import { EthSignRequest } from "@keystonehq/bc-ur-registry-eth";
import { buildRequestParts } from "../src/lib/keystone.ts";
import { normalizeEvmPath } from "../src/lib/config.ts";
import { fingerprintFromXpub } from "@slothsign/keystore";
import { ADDRESS, CAPTURED_PARTS, buildRequest, WALLET, XPUB } from "./fixtures/uniswap-request.ts";

function decodeParts(parts: string[]): EthSignRequest {
  const decoder = new URDecoder();
  for (const part of parts) decoder.receivePart(part);
  expect(decoder.isComplete()).toBe(true);
  expect(decoder.isSuccess()).toBe(true);
  const ur = decoder.resultUR();
  expect(ur.type).toBe("eth-sign-request");
  return EthSignRequest.fromCBOR(ur.cbor);
}

/** Decoded CBOR map, each value normalized so Buffers compare across realms. */
function fieldMap(parts: string[]): Record<string, string | undefined> {
  const decoder = new URDecoder();
  for (const part of parts) decoder.receivePart(part);
  expect(decoder.isComplete()).toBe(true);
  expect(decoder.isSuccess()).toBe(true);
  const map = decodeToDataItem(decoder.resultUR().cbor).getData();
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(map)) {
    const inner = (value as { getData?: () => unknown })?.getData?.() ?? value;
    out[key] = JSON.stringify(inner) ?? "undefined";
  }
  return out;
}

function assertMetadata(req: EthSignRequest, sourceFingerprint: string) {
  expect(req.getDerivationPath()).toBe("44'/60'/0'/0/0");
  expect(req.getSourceFingerprint()?.toString("hex")).toBe(sourceFingerprint);
  expect(req.getChainId()).toBe(42161);
  expect(req.getDataType()).toBe(4);
}

describe("wallet path normalization", () => {
  test("empty path normalizes to the default", () => {
    expect(normalizeEvmPath("")).toBe("m/44'/60'/0'/0/0");
    expect(normalizeEvmPath(undefined)).toBe("m/44'/60'/0'/0/0");
  });

  test("source fingerprint is computed from the account xpub", () => {
    expect(fingerprintFromXpub(XPUB)).toBe("4418d0b4");
  });
});

describe("compare UI output vs code output (uniswap permit)", () => {
  const generated = buildRequestParts(buildRequest(), WALLET);

  test("generated parts match Rabby's 4-part output for this payload", () => {
    expect(generated.parts.length).toBe(4);
    expect(CAPTURED_PARTS.length).toBe(5); // pre-fragment-bump capture
  });

  test("captured parts are each CRC-valid", () => {
    for (const part of CAPTURED_PARTS) {
      const decoder = new URDecoder();
      expect(() => decoder.receivePart(part)).not.toThrow();
    }
  });

  test("captured UI output carries the expected request metadata", () => {
    const req = decodeParts(CAPTURED_PARTS);
    assertMetadata(req, "939699b5"); // pre-xpub historical capture
    expect(req.getOrigin()).toBe("https://app.uniswap.org");
  });

  test("code output carries the expected request metadata", () => {
    const req = decodeParts(generated.parts);
    assertMetadata(req, fingerprintFromXpub(WALLET.xpub!));
    expect(req.getOrigin()).toBeUndefined();
    expect(req.getRequestId()?.length).toBe(16);
    expect(req.getRequestId()?.toString("hex")).toMatch(/^[0-9a-f]{32}$/);
    expect(Buffer.isBuffer(req.getSignData())).toBe(true);
    expect(req.getSignData().length).toBeGreaterThan(0);
    expect(req.getSignRequestAddress()?.toString("hex")).toBe(ADDRESS.slice(2));
  });

  test("captured UI output and code output carry identical data (except requestId, fingerprint, and address)", () => {
    const captured = fieldMap(CAPTURED_PARTS);
    const coded = fieldMap(generated.parts);
    for (const key of Object.keys(coded)) {
      // requestId (1) is random per build; keypath (5) changed to the xpub-derived
      // fingerprint; address (6) was added by the fix and is absent from the
      // pre-fix captured output.
      if (key === "1" || key === "5" || key === "6") continue;
      expect(captured[key], `field ${key}`).toBe(coded[key]);
    }
  });
});
