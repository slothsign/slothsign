import { describe, expect, test } from "bun:test";
import { UR, UREncoder, URDecoder } from "@ngraveio/bc-ur";
import { EthSignRequest, ETHSignature } from "@keystonehq/bc-ur-registry-eth";
import { encodeRequest } from "@slothsign/core";
import { decode as decodeCbor } from "borc";
import { fingerprintFromXpub } from "@slothsign/keystore";
import { buildRequestParts, decodeSignature } from "../src/lib/keystone.ts";
import type { SignPendingRequest } from "../src/lib/requestStore.ts";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const XPUB =
  "xpub6H6LG2We64bdwqNF7gNkUJ5EvDibiT2gbs77oonbawV86XE3eMxZf9czGQ9CPdSzsdsHLnLEjiJJEDnFMAyLrWATesaVbTYeggBXMHaFKLg";
const WALLET = { address: ADDRESS, path: "m/44'/60'/0'/0/0", xpub: XPUB };

function largeTransactionRequest(): SignPendingRequest {
  return {
    id: "req_x",
    kind: "sign",
    chain: "ethereum",
    method: "eth_sendTransaction",
    params: [],
    origin: "https://app.example",
    address: ADDRESS,
    signer: "keystone-qr",
    status: "pending",
    createdAt: 0,
    expiresAt: 0,
    signerRequest: {
      version: 1,
      chain: "ethereum",
      chainId: "0x1",
      address: ADDRESS,
      type: "transaction",
      payload: JSON.stringify({
        from: ADDRESS,
        to: "0x31bA53Ca350975007B27CF43AcB4D9Bc3db2641c",
        value: "0xde0b6b3a7640000",
        data: `0x${"11".repeat(600)}`,
        nonce: "0x1",
        gas: "0x5208",
        maxFeePerGas: "0x2540be400",
        maxPriorityFeePerGas: "0x3b9aca00",
        type: "0x2",
      }),
    },
  } as unknown as SignPendingRequest;
}

describe("eth-sign-request QR encoding", () => {
  const { parts } = buildRequestParts(largeTransactionRequest(), WALLET);

  test("generates a multipart UR", () => {
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part).toMatch(/^ur:eth-sign-request\/\d+-\d+\//);
    }
  });

  test("every part is individually CRC-valid", () => {
    for (const part of parts) {
      const decoder = new URDecoder();
      expect(() => decoder.receivePart(part)).not.toThrow();
    }
  });

  test("the full part set decodes to the original eth-sign-request", () => {
    const decoder = new URDecoder();
    for (const part of parts) {
      expect(() => decoder.receivePart(part)).not.toThrow();
    }
    expect(decoder.isComplete()).toBe(true);
    expect(decoder.isSuccess()).toBe(true);

    const ur = decoder.resultUR();
    expect(ur.type).toBe("eth-sign-request");

    const req = EthSignRequest.fromCBOR(ur.cbor);
    expect(req.getDerivationPath()).toBe("44'/60'/0'/0/0");
    expect(req.getSourceFingerprint()?.toString("hex")).toBe(fingerprintFromXpub(WALLET.xpub));
    expect(req.getChainId()).toBe(1);
    expect(req.getDataType()).toBe(4);
    expect(req.getSignData().length).toBeGreaterThan(0);
    expect(req.getRequestId()?.length).toBe(16);
    expect(req.getSignRequestAddress()?.toString("hex")).toBe(ADDRESS.slice(2).toLowerCase());
    expect(req.getOrigin()).toBeUndefined();
  });
});

describe("address-qr mode", () => {
  test("wraps the sloth transport in an animated multipart UR without needing an xpub", () => {
    const source = largeTransactionRequest();
    const request = {
      ...source,
      signer: "address-qr",
      transport: encodeRequest(source.signerRequest),
    } as unknown as SignPendingRequest;
    const { parts, fallback } = buildRequestParts(request, { address: ADDRESS });

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part).toMatch(/^ur:sloth-sign-request\/\d+-\d+\//);
    }
    expect(fallback).toBe(encodeRequest(source.signerRequest));

    const decoder = new URDecoder();
    for (const part of parts) {
      expect(() => decoder.receivePart(part)).not.toThrow();
    }
    expect(decoder.isComplete()).toBe(true);
    expect(decoder.isSuccess()).toBe(true);
    expect(decoder.resultUR().type).toBe("sloth-sign-request");
    expect(decodeCbor(decoder.resultUR().cbor)).toBe(encodeRequest(source.signerRequest));
  });
});

describe("decodeSignature (eth-signature UR)", () => {
  test("parses a single-part eth-signature UR into a hex signature", () => {
    const signature = new ETHSignature(
      Buffer.from("deadbeef", "hex"),
      Buffer.from("0123456789ab4cde8f0123456789abcd", "hex"),
      "https://app.uniswap.org",
    );
    const text = new UREncoder(new UR(signature.toCBOR(), "eth-signature"), 200).encodeWhole()[0];
    expect(text.startsWith("ur:eth-signature/")).toBe(true);
    expect(decodeSignature(text, "ethereum")).toBe("0xdeadbeef");
  });

  test("passes non-UR transport strings through unchanged", () => {
    expect(decodeSignature("sloth://sig/abc123", "ethereum")).toBe("sloth://sig/abc123");
  });
});
