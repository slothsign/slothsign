import { describe, expect, test } from "bun:test";
import { renderEvmRequest } from "./render.ts";
import type { SignerRequest } from "@slothsign/core";

function messageRequest(message: string): SignerRequest {
  return {
    version: 1,
    chain: "ethereum",
    chainId: "1",
    address: "0x0000000000000000000000000000000000000000",
    type: "message",
    payload: JSON.stringify({ message, address: "0x0000000000000000000000000000000000000000" }),
  };
}

describe("renderEvmRequest message decoding", () => {
  test("decodes a hex message to text", () => {
    const result = renderEvmRequest(messageRequest("0x68656c6c6f"));
    expect(result.known).toBe(true);
    expect(result.intent?.message).toBe("hello");
  });

  test("passes plain text messages through unchanged", () => {
    const result = renderEvmRequest(messageRequest("hello"));
    expect(result.known).toBe(true);
    expect(result.intent?.message).toBe("hello");
  });

  test("keeps non-hex 0x-prefixed text as-is", () => {
    const result = renderEvmRequest(messageRequest("0xzzzz"));
    expect(result.known).toBe(true);
    expect(result.intent?.message).toBe("0xzzzz");
  });

  test("does not keep invalid UTF-8 hex as the literal hex string", () => {
    const result = renderEvmRequest(messageRequest("0xdeadbeef"));
    expect(result.known).toBe(true);
    expect(result.intent?.message).not.toBe("0xdeadbeef");
  });
});
