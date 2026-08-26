import { describe, expect, test } from "bun:test";
import {
  keccak256,
  recoverAddress,
  serializeTransaction,
  toHex,
  verifyMessage,
  verifyTypedData,
} from "viem";
import { evmSerializable } from "./serialize.ts";
import {
  addressFromPrivateKey,
  signEvmSignature,
  signMessage,
  signMessageBytes,
  signSerializedTransaction,
  signTypedData,
  signTypedDataBytes,
} from "./signer.ts";
import type { PrivateKey } from "./signer.ts";

// Account 0 from the well-known test mnemonic "test test ... junk"
const privateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as PrivateKey;
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("addressFromPrivateKey", () => {
  test("derives the correct address", () => {
    expect(addressFromPrivateKey(privateKey).toLowerCase()).toBe(ADDRESS.toLowerCase());
  });
});

describe("signEvmSignature", () => {
  test("produces a 65-byte signature that recovers to the signer", async () => {
    const tx = {
      from: ADDRESS,
      to: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      value: "1000000",
      gas: "21000",
      nonce: "0",
    };
    const signature = await signEvmSignature(privateKey, tx, "0x1");
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    const serializable = evmSerializable(tx, "0x1");
    const hash = keccak256(serializeTransaction(serializable));
    const recovered = await recoverAddress({ hash, signature });
    expect(recovered.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });
});

describe("signMessage", () => {
  test("signs hex message as raw bytes", async () => {
    const message = "0xdeadbeef";
    const signature = await signMessage(privateKey, message);
    const valid = await verifyMessage({
      address: ADDRESS,
      message: { raw: message },
      signature,
    });
    expect(valid).toBe(true);
  });

  test("signs non-hex string as UTF-8", async () => {
    const message = "hello world";
    const signature = await signMessage(privateKey, message);
    const valid = await verifyMessage({
      address: ADDRESS,
      message,
      signature,
    });
    expect(valid).toBe(true);
  });

  test("hex message without 0x is treated as UTF-8", async () => {
    const message = "deadbeef";
    const signature = await signMessage(privateKey, message);
    const valid = await verifyMessage({
      address: ADDRESS,
      message,
      signature,
    });
    expect(valid).toBe(true);
  });
});

describe("signTypedData", () => {
  test("signs EIP-712 typed data", async () => {
    const typedData = {
      domain: {
        name: "Test",
        version: "1",
        chainId: 1,
        verifyingContract: "0x0000000000000000000000000000000000000000",
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Person: [
          { name: "name", type: "string" },
          { name: "wallet", type: "address" },
        ],
        Mail: [
          { name: "from", type: "Person" },
          { name: "to", type: "Person" },
          { name: "contents", type: "string" },
        ],
      },
      primaryType: "Mail",
      message: {
        from: { name: "Alice", wallet: "0x0000000000000000000000000000000000000000" },
        to: { name: "Bob", wallet: "0x0000000000000000000000000000000000000001" },
        contents: "Hello",
      },
    };
    const signature = await signTypedData(privateKey, typedData as Record<string, unknown>);
    const valid = await verifyTypedData({
      address: ADDRESS,
      ...typedData,
      signature,
    } as never);
    expect(valid).toBe(true);
  });
});

describe("signSerializedTransaction", () => {
  test("signs the keccak digest of serialized bytes and recovers", async () => {
    const tx = {
      from: ADDRESS,
      to: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      value: "1000000",
      gas: "21000",
      nonce: "0",
    };
    const serialized = serializeTransaction(evmSerializable(tx, "0x1"));
    const signature = await signSerializedTransaction(
      privateKey,
      Buffer.from(serialized.slice(2), "hex"),
    );
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    const hash = keccak256(serialized);
    const recovered = await recoverAddress({ hash, signature });
    expect(recovered.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });
});

describe("signMessageBytes", () => {
  test("signs raw bytes and verifies via EIP-191", async () => {
    const bytes = new TextEncoder().encode("hello world");
    const signature = await signMessageBytes(privateKey, bytes);
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    const valid = await verifyMessage({
      address: ADDRESS,
      message: { raw: toHex(bytes) },
      signature,
    });
    expect(valid).toBe(true);
  });
});

describe("signTypedDataBytes", () => {
  test("parses JSON bytes and signs typed data", async () => {
    const typedData = {
      domain: { name: "Test", version: "1", chainId: 1 },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
        ],
        Person: [
          { name: "name", type: "string" },
          { name: "wallet", type: "address" },
        ],
        Mail: [
          { name: "from", type: "Person" },
          { name: "to", type: "Person" },
          { name: "contents", type: "string" },
        ],
      },
      primaryType: "Mail",
      message: {
        from: { name: "Alice", wallet: "0x0000000000000000000000000000000000000000" },
        to: { name: "Bob", wallet: "0x0000000000000000000000000000000000000001" },
        contents: "Hello",
      },
    };
    const signature = await signTypedDataBytes(
      privateKey,
      new TextEncoder().encode(JSON.stringify(typedData)),
    );
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    const valid = await verifyTypedData({
      address: ADDRESS,
      ...typedData,
      signature,
    } as never);
    expect(valid).toBe(true);
  });
});
