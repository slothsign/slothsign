import { describe, expect, test } from "bun:test";
import {
  REQUEST_PREFIX,
  RESULT_PREFIX,
  base64UrlToBytes,
  bytesToBase64Url,
  decodeRequest,
  decodeResult,
  encodeRequest,
  encodeResult,
  requestFingerprint,
} from "./codec.ts";

describe("base64url", () => {
  test("round-trips arbitrary bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });

  test("uses URL-safe alphabet without padding", () => {
    const encoded = bytesToBase64Url(new TextEncoder().encode(">??"));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("request codec", () => {
  const request = {
    version: 1,
    chain: "ethereum",
    chainId: "1",
    address: "0x0000000000000000000000000000000000000000",
    type: "message",
    payload: JSON.stringify({ message: "0xdeadbeef", address: "0x0" }),
  } as const;

  test("encodeRequest produces sloth://req/ prefix", () => {
    const encoded = encodeRequest(request);
    expect(encoded.startsWith(REQUEST_PREFIX)).toBe(true);
  });

  test("round-trips a request", () => {
    const decoded = decodeRequest(encodeRequest(request));
    expect(decoded).toEqual(request);
  });

  test("appends a short fingerprint suffix", () => {
    const encoded = encodeRequest(request);
    const suffix = encoded.slice(REQUEST_PREFIX.length);
    const [payload, fingerprint] = suffix.split(".");
    expect(fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(payload).not.toContain(".");
    expect(fingerprint).toBe(requestFingerprint(JSON.stringify(request)));
  });

  test("rejects non-prefixed input", () => {
    expect(() => decodeRequest("garbage")).toThrow("missing sloth://req/");
  });

  test("rejects request without fingerprint", () => {
    const bare =
      REQUEST_PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(request)));
    expect(() => decodeRequest(bare)).toThrow("missing fingerprint");
  });

  test("rejects schema-invalid payload", () => {
    const badJson = JSON.stringify({ ...request, version: 99 });
    const bad = REQUEST_PREFIX + bytesToBase64Url(new TextEncoder().encode(badJson)) + ".00000000";
    expect(() => decodeRequest(bad)).toThrow("schema mismatch");
  });

  test("rejects fingerprint mismatch (corrupted payload)", () => {
    const json = JSON.stringify(request);
    const corrupted = json.replace('"chainId":"1"', '"chainId":"2"');
    const bad =
      REQUEST_PREFIX +
      bytesToBase64Url(new TextEncoder().encode(corrupted)) +
      "." +
      requestFingerprint(json);
    expect(() => decodeRequest(bad)).toThrow("fingerprint mismatch");
  });
});

describe("result codec", () => {
  test("encodeResult produces sloth://sig/ prefix", () => {
    expect(encodeResult({ chain: "ethereum", result: "0x1234" }).startsWith(RESULT_PREFIX)).toBe(
      true,
    );
  });

  test("round-trips a result", () => {
    const encoded = encodeResult({ chain: "solana", result: "base64==" });
    const decoded = decodeResult(encoded);
    expect(decoded).toEqual({ chain: "solana", result: "base64==" });
  });

  test("rejects unknown chain", () => {
    const encoded =
      RESULT_PREFIX +
      bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ chain: "cosmos", result: "x" })));
    expect(() => decodeResult(encoded)).toThrow("unknown chain");
  });
});
