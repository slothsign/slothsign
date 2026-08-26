import { describe, expect, test } from "bun:test";
import { decodeToDataItem } from "@keystonehq/bc-ur-registry";
import { DataType, EthSignRequest } from "@keystonehq/bc-ur-registry-eth";
import { encodeDataItem } from "../src/lib/ur-cbor.ts";

const REQUEST_ID = "01234567-89ab-4cde-8f01-23456789abcd";
const SIGN_DATA = "deadbeef".repeat(8);

function buildRequest(): EthSignRequest {
  return EthSignRequest.constructETHRequest(
    Buffer.from(SIGN_DATA, "hex"),
    DataType.transaction,
    "m/44'/60'/0'/0/0",
    "939699b5",
    REQUEST_ID,
    42161,
    undefined,
    "https://app.uniswap.org",
  );
}

describe("ur-cbor: borc-based eth-sign-request encoding", () => {
  test("byte fields are CBOR byte strings, not maps", () => {
    const cbor = encodeDataItem(buildRequest().toDataItem());
    const map = decodeToDataItem(cbor).getData();

    const requestIdItem = map[1];
    expect(requestIdItem?.getTag?.()).toBe(37);
    const requestId = requestIdItem?.getData?.();
    expect(requestId).toBeInstanceOf(Buffer);
    expect(requestId.length).toBe(16);

    const signData = map[2];
    expect(signData).toBeInstanceOf(Buffer);
    expect(signData.toString("hex")).toBe(SIGN_DATA);
  });

  test("round-trips to an identical EthSignRequest", () => {
    const decoded = EthSignRequest.fromCBOR(encodeDataItem(buildRequest().toDataItem()));
    expect(decoded.getRequestId()?.toString("hex")).toBe(REQUEST_ID.replace(/-/g, ""));
    expect(decoded.getSignData().toString("hex")).toBe(SIGN_DATA);
    expect(decoded.getDataType()).toBe(DataType.transaction);
    expect(decoded.getChainId()).toBe(42161);
    expect(decoded.getDerivationPath()).toBe("44'/60'/0'/0/0");
    expect(decoded.getSourceFingerprint()?.toString("hex")).toBe("939699b5");
    expect(decoded.getOrigin()).toBe("https://app.uniswap.org");
  });
});
