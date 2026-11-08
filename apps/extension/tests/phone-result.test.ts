import { describe, expect, test } from "bun:test";
import { encodeResult, decodeResult } from "@slothsign/core";
import { encodeSlothResultUr } from "@slothsign/qr-codec/sloth";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { decodeSignature } from "../src/lib/keystone.ts";
import { signedSolanaTransaction } from "../src/lib/solana-result.ts";

async function transfer() {
  const keypair = await Keypair.fromSeed(new Uint8Array(32).fill(7));
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
  }).add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: (await Keypair.fromSeed(new Uint8Array(32).fill(9))).publicKey,
      lamports: 1000,
    }),
  );
  const serialized = new Uint8Array(
    await transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
  await transaction.sign(keypair);
  return {
    address: keypair.publicKey.toBase58(),
    serialized,
    signed: new Uint8Array(await transaction.serialize()),
    signature: new Uint8Array(transaction.signature!),
  };
}

describe("phone signature scan-back", () => {
  test("a scanned sloth-sign-result resolves to its transport string", () => {
    const transport = encodeResult({ chain: "ethereum", result: "0xabc" });
    expect(decodeSignature(encodeSlothResultUr(transport), "ethereum")).toBe(transport);
  });

  test("a result for the other chain keeps its chain for the submit check", () => {
    const transport = encodeResult({ chain: "solana", result: "c2ln" });
    const decoded = decodeSignature(encodeSlothResultUr(transport), "ethereum") as string;
    expect(decodeResult(decoded).chain).toBe("solana");
  });
});

describe("signedSolanaTransaction", () => {
  test("address-qr injects a detached signature", async () => {
    const { address, serialized, signed, signature } = await transfer();
    expect(await signedSolanaTransaction("address-qr", serialized, signature, address)).toEqual(
      signed,
    );
  });

  test("address-qr passes through a full signed transaction", async () => {
    const { address, serialized, signed } = await transfer();
    expect(await signedSolanaTransaction("address-qr", serialized, signed, address)).toEqual(
      signed,
    );
  });

  test("trezor injects its detached signature", async () => {
    const { address, serialized, signed, signature } = await transfer();
    expect(await signedSolanaTransaction("trezor", serialized, signature, address)).toEqual(signed);
  });

  test("trezor rejects anything but a detached signature", async () => {
    const { address, serialized, signed } = await transfer();
    await expect(signedSolanaTransaction("trezor", serialized, signed, address)).rejects.toThrow();
  });

  test("keystone-qr rejects anything but a detached signature", async () => {
    const { address, serialized, signed } = await transfer();
    await expect(
      signedSolanaTransaction("keystone-qr", serialized, signed, address),
    ).rejects.toThrow();
  });
});
