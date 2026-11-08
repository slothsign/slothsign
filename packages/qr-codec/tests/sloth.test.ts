import { describe, expect, test } from "bun:test";
import { UR, URDecoder, UREncoder } from "@ngraveio/bc-ur";
import { decodeResult, encodeRequest, encodeResult, type SignerRequest } from "@slothsign/core";
import { encode } from "borc";
import {
  decodeSlothRequestUr,
  decodeSlothResultUr,
  encodeSlothResultUr,
  SLOTH_REQUEST_UR,
} from "../src/sloth.ts";

const REQUEST: SignerRequest = {
  version: 1,
  chain: "ethereum",
  chainId: "0x1",
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  type: "message",
  payload: JSON.stringify({ message: "Hello", address: "0xf39F" }),
};

describe("sloth URs", () => {
  test("decodes an animated request", () => {
    const ur = new UR(encode(encodeRequest(REQUEST)), SLOTH_REQUEST_UR);
    const decoder = new URDecoder();
    for (const part of new UREncoder(ur, 32).encodeWhole()) decoder.receivePart(part);
    expect(decoder.isSuccess()).toBe(true);
    expect(decodeSlothRequestUr(decoder.resultUR())).toEqual(REQUEST);
  });

  test("round-trips a result in one QR part", () => {
    const transport = encodeResult({ chain: "solana", result: "c2lnbmF0dXJl" });
    const decoded = decodeSlothResultUr(URDecoder.decode(encodeSlothResultUr(transport)));
    expect(decodeResult(decoded)).toEqual({ chain: "solana", result: "c2lnbmF0dXJl" });
  });

  test("rejects a request UR where a result is expected", () => {
    const ur = new UR(encode(encodeRequest(REQUEST)), SLOTH_REQUEST_UR);
    expect(() => decodeSlothResultUr(ur)).toThrow("Unexpected QR type");
  });

  test("refuses to encode something that is not a result", () => {
    expect(() => encodeSlothResultUr("not-a-result")).toThrow();
  });
});
