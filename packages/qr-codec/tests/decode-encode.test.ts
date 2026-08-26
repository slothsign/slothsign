import { describe, expect, test } from "bun:test";
import { UR, UREncoder, URDecoder } from "@ngraveio/bc-ur";
import { EthSignRequest, DataType, ETHSignature } from "@keystonehq/bc-ur-registry-eth";
import { SolSignRequest, SolSignature } from "@keystonehq/bc-ur-registry-sol";
import { encodeRequest } from "@slothsign/core";
import { CryptoKeypath, PathComponent } from "@keystonehq/bc-ur-registry";
import { encode as encodeCbor } from "borc";
import { decodeRequestText } from "../src/decode.ts";
import { encodeKeystoneSignature } from "../src/encode.ts";
import { encodeDataItem } from "../src/cbor.ts";

const ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_SIGN_DATA = Buffer.from("deadbeef01020304", "hex");

function buildEthSignRequestUr(): string {
  const req = EthSignRequest.constructETHRequest(
    SAMPLE_SIGN_DATA,
    DataType.personalMessage,
    "m/44'/60'/0'/0/0",
    "f1a2b3c4",
    REQUEST_ID,
    1,
    ADDRESS,
    "https://app.example.com",
  );
  const cbor = encodeDataItem(req.toDataItem());
  const ur = new UR(cbor, req.getRegistryType().getType());
  return UREncoder.encodeSinglePart(ur);
}

function buildSolSignRequestUr(): string {
  const keypath = new CryptoKeypath([
    new PathComponent({ index: 44, hardened: true }),
    new PathComponent({ index: 501, hardened: true }),
    new PathComponent({ index: 0, hardened: true }),
    new PathComponent({ index: 0, hardened: false }),
    new PathComponent({ index: 0, hardened: false }),
  ]);
  const pubkey = Buffer.from(
    "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "hex",
  );
  const req = new SolSignRequest({
    signData: SAMPLE_SIGN_DATA,
    signType: 1,
    derivationPath: keypath,
    requestId: Buffer.from(REQUEST_ID.replace(/-/g, ""), "hex"),
    origin: "https://app.example.com",
    address: pubkey,
  });
  const cbor = encodeDataItem(req.toDataItem());
  const ur = new UR(cbor, req.getRegistryType().getType());
  return UREncoder.encodeSinglePart(ur);
}

describe("decodeRequestText", () => {
  test("decodes a sloth://req/ transport string", () => {
    const request = {
      version: 1,
      chain: "ethereum" as const,
      chainId: "0x1",
      address: ADDRESS,
      type: "message" as const,
      payload: JSON.stringify({ message: "hello" }),
    };
    const transport = encodeRequest(request);
    const decoded = decodeRequestText(transport);
    expect(decoded.kind).toBe("signer");
    if (decoded.kind === "signer") {
      expect(decoded.request.chain).toBe("ethereum");
      expect(decoded.request.address).toBe(ADDRESS);
    }
  });

  test("decodes raw JSON SignerRequest", () => {
    const request = {
      version: 1 as const,
      chain: "ethereum" as const,
      chainId: "0x1",
      address: ADDRESS,
      type: "message" as const,
      payload: "hello",
    };
    const decoded = decodeRequestText(JSON.stringify(request));
    expect(decoded.kind).toBe("signer");
    if (decoded.kind === "signer") {
      expect(decoded.request.chain).toBe("ethereum");
    }
  });

  test("decodes an eth-sign-request UR", () => {
    const urText = buildEthSignRequestUr();
    const decoded = decodeRequestText(urText);
    expect(decoded.kind).toBe("keystone");
    if (decoded.kind === "keystone") {
      expect(decoded.chain).toBe("ethereum");
      expect(decoded.requestId).toBe(REQUEST_ID);
      expect(new Uint8Array(decoded.signData)).toEqual(new Uint8Array(SAMPLE_SIGN_DATA));
      expect(decoded.dataType).toBe(DataType.personalMessage);
      expect(decoded.path).toBe("m/44'/60'/0'/0/0");
      expect(decoded.chainId).toBe(1);
      expect(decoded.address).toBe(ADDRESS);
      expect(decoded.origin).toBe("https://app.example.com");
    }
  });

  test("decodes a sol-sign-request UR", () => {
    const urText = buildSolSignRequestUr();
    const decoded = decodeRequestText(urText);
    expect(decoded.kind).toBe("keystone");
    if (decoded.kind === "keystone") {
      expect(decoded.chain).toBe("solana");
      expect(decoded.requestId).toBe(REQUEST_ID);
      expect(new Uint8Array(decoded.signData)).toEqual(new Uint8Array(SAMPLE_SIGN_DATA));
      expect(decoded.signType).toBe(1);
      expect(decoded.path).toBe("m/44'/501'/0'/0/0");
      expect(decoded.origin).toBe("https://app.example.com");
    }
  });

  test("decodes a sloth-sign-request UR wrapping a transport", () => {
    const request = {
      version: 1,
      chain: "solana" as const,
      chainId: "0x1",
      address: "11111111111111111111111111111111",
      type: "message" as const,
      payload: "hello",
    };
    const transport = encodeRequest(request);
    const cbor = encodeCbor(transport);
    const ur = new UR(cbor, "sloth-sign-request");
    const urText = UREncoder.encodeSinglePart(ur);
    const decoded = decodeRequestText(urText);
    expect(decoded.kind).toBe("signer");
    if (decoded.kind === "signer") {
      expect(decoded.request.chain).toBe("solana");
    }
  });

  test("rejects unknown UR types", () => {
    const ur = new UR(Buffer.from("hello"), "unknown-type");
    const text = UREncoder.encodeSinglePart(ur);
    expect(() => decodeRequestText(text)).toThrow("Unsupported UR type");
  });
});

describe("encodeKeystoneSignature", () => {
  test("round-trips eth-signature UR", () => {
    const sigBytes = new Uint8Array(65).fill(0xab);
    sigBytes[64] = 0x1c; // v
    const urText = encodeKeystoneSignature(
      "ethereum",
      sigBytes,
      REQUEST_ID,
      "https://app.example.com",
    );

    const decoder = new URDecoder();
    decoder.receivePart(urText);
    expect(decoder.isSuccess()).toBe(true);
    const ur = decoder.resultUR();
    expect(ur.type).toBe("eth-signature");

    const sig = ETHSignature.fromCBOR(ur.cbor);
    expect(new Uint8Array(sig.getSignature())).toEqual(sigBytes);
    expect(sig.getOrigin()).toBe("https://app.example.com");
  });

  test("round-trips sol-signature UR", () => {
    const sigBytes = new Uint8Array(64).fill(0xcd);
    const urText = encodeKeystoneSignature("solana", sigBytes, REQUEST_ID);

    const decoder = new URDecoder();
    decoder.receivePart(urText);
    expect(decoder.isSuccess()).toBe(true);
    const ur = decoder.resultUR();
    expect(ur.type).toBe("sol-signature");

    const sig = SolSignature.fromCBOR(ur.cbor);
    expect(new Uint8Array(sig.getSignature())).toEqual(sigBytes);
  });
});
