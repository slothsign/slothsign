import { describe, expect, test } from "bun:test";
import { URDecoder } from "@ngraveio/bc-ur";
import { EthSignRequest } from "@keystonehq/bc-ur-registry-eth";
import { fingerprintFromXpub } from "@slothsign/keystore";
import { buildRequestParts } from "../src/lib/keystone.ts";
import type { SignPendingRequest } from "../src/lib/requestStore.ts";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const XPUB =
  "xpub6H6LG2We64bdwqNF7gNkUJ5EvDibiT2gbs77oonbawV86XE3eMxZf9czGQ9CPdSzsdsHLnLEjiJJEDnFMAyLrWATesaVbTYeggBXMHaFKLg";

/**
 * The raw request JSON shown in the UI ("Request JSON (before encoding)").
 * This is exactly what buildRequestParts consumes: origin + wallet + signerRequest.
 */
const RAW_JSON = {
  origin: "https://app.example",
  chain: "ethereum" as const,
  address: ADDRESS,
  wallet: { path: "m/44'/60'/0'/0/0", xpub: XPUB, address: ADDRESS },
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
      data: `0x${"11".repeat(700)}`,
      nonce: "0x1",
      gas: "0x5208",
      maxFeePerGas: "0x2540be400",
      maxPriorityFeePerGas: "0x3b9aca00",
      type: "0x2",
    }),
  },
};

function toRequest(raw: typeof RAW_JSON): SignPendingRequest {
  return {
    id: "req_x",
    kind: "sign",
    chain: raw.chain,
    method: "eth_sendTransaction",
    params: [],
    origin: raw.origin,
    address: raw.address,
    signer: "keystone-qr",
    status: "pending",
    createdAt: 0,
    expiresAt: 0,
    transport: "",
    signerRequest: raw.signerRequest,
  } as unknown as SignPendingRequest;
}

describe("complete raw JSON -> multipart ur -> decode pipeline", () => {
  const { parts } = buildRequestParts(toRequest(RAW_JSON), RAW_JSON.wallet);

  test("produces 4 parts for this payload (matches Rabby's 4-part output)", () => {
    expect(parts.length).toBe(4);
  });

  test("every part is individually CRC-valid", () => {
    for (const part of parts) {
      const decoder = new URDecoder();
      expect(() => decoder.receivePart(part)).not.toThrow();
    }
  });

  test("all parts reconstruct to the original eth-sign-request", () => {
    const decoder = new URDecoder();
    for (const part of parts) {
      decoder.receivePart(part);
    }
    expect(decoder.isComplete()).toBe(true);
    expect(decoder.isSuccess()).toBe(true);

    const ur = decoder.resultUR();
    expect(ur.type).toBe("eth-sign-request");

    const req = EthSignRequest.fromCBOR(ur.cbor);
    expect(req.getDerivationPath()).toBe("44'/60'/0'/0/0");
    expect(req.getSourceFingerprint()?.toString("hex")).toBe(fingerprintFromXpub(XPUB));
    expect(req.getChainId()).toBe(1);
    expect(req.getDataType()).toBe(4);
    expect(req.getRequestId()?.length).toBe(16);
    expect(req.getSignRequestAddress()?.toString("hex")).toBe(ADDRESS.slice(2).toLowerCase());
    expect(req.getOrigin()).toBeUndefined();

    // signData is the serialized unsigned transaction.
    expect(req.getSignData().length).toBeGreaterThan(0);
  });
});
