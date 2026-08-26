import { describe, expect, test } from "bun:test";
import { serializeTransaction } from "viem";
import { evmSerializable, isTypedTransaction, numField, hexField } from "./serialize.ts";

describe("numField", () => {
  test("parses 0x-prefixed hex strings", () => {
    expect(numField("0x5208")).toBe(21000n);
  });
  test("parses bare decimal strings — might become '0x' in future", () => {
    expect(numField("0x21000")).toBe(135168n);
  });
  test("returns undefined for empty", () => {
    expect(numField("")).toBeUndefined();
    expect(numField(undefined)).toBeUndefined();
  });
});

describe("hexField", () => {
  test("passes through 0x-prefixed values", () => {
    expect(hexField("0x1234")).toBe("0x1234");
  });
  test("adds 0x prefix to bare hex", () => {
    expect(hexField("1234")).toBe("0x1234");
  });
  test("applies fallback", () => {
    expect(hexField("", "0x0")).toBe("0x0");
  });
});

describe("isTypedTransaction", () => {
  test("detects explicit type 0x2", () => {
    expect(isTypedTransaction({ from: "0x0", type: "0x2" })).toBe(true);
    expect(isTypedTransaction({ from: "0x0", type: "0x02" })).toBe(true);
  });
  test("detects legacy types", () => {
    expect(isTypedTransaction({ from: "0x0", type: "0x0" })).toBe(false);
    expect(isTypedTransaction({ from: "0x0", type: "0x1" })).toBe(false);
  });
  test("infers EIP-1559 from fee fields", () => {
    expect(isTypedTransaction({ from: "0x0", maxFeePerGas: "0x100" })).toBe(true);
    expect(isTypedTransaction({ from: "0x0", maxPriorityFeePerGas: "0x1" })).toBe(true);
  });
  test("defaults to legacy", () => {
    expect(isTypedTransaction({ from: "0x0", to: "0x0" })).toBe(false);
  });
});

describe("evmSerializable", () => {
  test("produces a serializable legacy tx", () => {
    const tx = {
      from: "0x0000000000000000000000000000000000000000",
      to: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      value: "0xf4240",
      gas: "0x5208",
      nonce: "0x0",
    };
    const serializable = evmSerializable(tx, "0x1");
    expect(serializable).toMatchObject({
      chainId: 1,
      type: "legacy",
      to: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      value: 1000000n,
      gas: 21000n,
      nonce: 0n,
    });
    expect(typeof serializeTransaction(serializable)).toBe("string");
  });

  test("produces an EIP-1559 tx when fee fields present", () => {
    const serializable = evmSerializable(
      { from: "0x0", maxFeePerGas: "0x3b9aca00", maxPriorityFeePerGas: "0x3b9aca00" },
      "0x1",
    );
    expect(serializable.type).toBe("eip1559");
    expect(serializable.maxFeePerGas).toBe(1000000000n);
  });

  test("chainId overrides are applied", () => {
    const serializable = evmSerializable({ from: "0x0" }, "8453");
    expect(serializable.chainId).toBe(8453);
  });
});
