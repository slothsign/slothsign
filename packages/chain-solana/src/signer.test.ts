import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, test } from "bun:test";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  type Blockhash,
} from "@solana/web3.js";
import {
  signTransaction,
  signTransactionDetached,
  signTransactionWithDetachedSignature,
  signMessage,
  signMessageFromPayload,
  keypairFromMnemonic,
  keypairFromSecret,
} from "./signer.ts";
import { extractSignature } from "./broadcast.ts";
import { bytesToBase64, base64ToBytes } from "./payload.ts";

const MNEMONIC = "repair item secret false deliver skin salmon guard inspire pill lesson adult";
const ADDRESS = "BTq6wsM2EA6L8NyG19GPFJ7j9tGJmt8786CzMab7YPiM";

function randomKey(): PublicKey {
  return new PublicKey(crypto.getRandomValues(new Uint8Array(32)));
}

function legacyTx(): Promise<Uint8Array> {
  const kp = keypairFromMnemonic(MNEMONIC);
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: randomKey(),
      lamports: 100,
    }),
  );
  tx.recentBlockhash = randomKey().toBase58() as string as Blockhash;
  tx.feePayer = kp.publicKey;
  return tx.serialize({ verifySignatures: false });
}

function versionedTx(): VersionedTransaction {
  const kp = keypairFromMnemonic(MNEMONIC);
  const message = new TransactionMessage({
    recentBlockhash: randomKey().toBase58() as string as Blockhash,
    payerKey: kp.publicKey,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: randomKey(),
        lamports: 100,
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe("keypairFromMnemonic", () => {
  test("derives the expected public key (SLIP-0010)", () => {
    expect<string>(keypairFromMnemonic(MNEMONIC).publicKey.toBase58()).toBe(ADDRESS);
  });

  test("honors an explicit derivation path", () => {
    const kp = keypairFromMnemonic(MNEMONIC, "m/44'/501'/1'/0'");
    expect(kp.publicKey.toBase58()).not.toBe(ADDRESS);
  });

  test("honors a BIP-39 passphrase", () => {
    const plain = keypairFromMnemonic(MNEMONIC);
    const protectedKp = keypairFromMnemonic(MNEMONIC, "m/44'/501'/0'/0'", "passphrase");
    expect(protectedKp.publicKey.toBase58()).not.toBe(plain.publicKey.toBase58());
  });
});

describe("keypairFromSecret", () => {
  test("builds a keypair from a 64-byte base58 secret key", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const b58 = base58Encode(kp.secretKey);
    expect(keypairFromSecret(b58).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  test("builds a keypair from a 32-byte base58 seed", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const b58 = base58Encode(kp.secretKey.slice(0, 32));
    expect(keypairFromSecret(b58).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  test("rejects an invalid secret", () => {
    expect(() => keypairFromSecret("notbase58!")).toThrow();
  });
});

function base58Encode(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let zeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    zeros++;
  }
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "1".repeat(zeros);
  for (const d of digits.reverse()) out += alphabet[d]!;
  return out || "1";
}

describe("signTransaction (legacy)", () => {
  test("signs and returns a verifiable legacy transaction", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = await legacyTx();
    const signed = await signTransaction(kp, tx);
    const parsed = Transaction.from(signed);
    expect(parsed.signatures.length).toBe(1);
    expect(parsed.signatures[0]?.signature).not.toBeNull();
    expect(await parsed.verifySignatures()).toBe(true);
  });
});

describe("signTransaction (versioned)", () => {
  test("auto-detects versioned transactions", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx();
    const signed = await signTransaction(kp, tx.serialize());
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures.length).toBe(1);
    expect(parsed.signatures[0]).not.toEqual(new Uint8Array(64));
  });

  test("signed versioned tx carries a 64-byte signature", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx();
    const signed = await signTransaction(kp, tx.serialize());
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures[0]?.length).toBe(64);
  });
});

describe("signMessage", () => {
  test("returns a valid ed25519 detached signature", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const message = new TextEncoder().encode("hello world");
    const sig = await signMessage(kp, message);
    expect(sig.length).toBe(64);
    expect(ed25519.verify(sig, message, kp.publicKey.toBytes())).toBe(true);
  });
});

describe("signMessageFromPayload", () => {
  test("signs the base64-encoded message in the payload", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const message = new TextEncoder().encode("0xdeadbeef");
    const payload = JSON.stringify({ message: bytesToBase64(message), publicKey: ADDRESS });
    const sig = await signMessageFromPayload(kp, payload);
    expect(ed25519.verify(sig, message, kp.publicKey.toBytes())).toBe(true);
    expect(base64ToBytes).toBeDefined();
  });
});

describe("signTransactionDetached", () => {
  test("legacy: returns a 64-byte signature that matches the signed tx", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = await legacyTx();
    const sig = signTransactionDetached(kp, tx);

    expect(sig.length).toBe(64);

    const signed = await signTransaction(kp, tx);
    const parsed = Transaction.from(signed);
    expect(parsed.signatures.length).toBe(1);
    expect(Buffer.from(parsed.signatures[0]?.signature ?? []).toString("hex")).toBe(
      Buffer.from(sig).toString("hex"),
    );
    expect(await parsed.verifySignatures()).toBe(true);
  });

  test("versioned: returns a 64-byte signature that matches the signed tx", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx().serialize();
    const sig = signTransactionDetached(kp, tx);

    expect(sig.length).toBe(64);

    const signed = await signTransaction(kp, tx);
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures[0]).toEqual(sig);
  });
});

describe("extractSignature", () => {
  test("legacy: extracts the 64-byte signature from a signed transaction", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const signed = await signTransaction(kp, await legacyTx());
    const sig = extractSignature(signed);
    expect(sig.length).toBe(64);
    const parsed = Transaction.from(signed);
    expect(Buffer.from(sig).toString("hex")).toBe(
      Buffer.from(parsed.signatures[0]?.signature ?? []).toString("hex"),
    );
  });

  test("versioned: extracts the 64-byte signature from a signed transaction", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const signed = await signTransaction(kp, versionedTx().serialize());
    const sig = extractSignature(signed);
    expect(sig.length).toBe(64);
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures[0]).toEqual(sig);
  });

  test("matches the detached signature for the same key", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = await legacyTx();
    const detached = signTransactionDetached(kp, tx);
    const sig = extractSignature(await signTransaction(kp, tx));
    expect(Buffer.from(sig).toString("hex")).toBe(Buffer.from(detached).toString("hex"));
  });
});

describe("signTransactionWithDetachedSignature", () => {
  test("legacy: injecting the detached sig yields the same signed tx", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = await legacyTx();
    const sig = signTransactionDetached(kp, tx);

    const injected = await signTransactionWithDetachedSignature(tx, sig, kp.publicKey.toBase58());
    const parsed = Transaction.from(injected);
    expect(parsed.signatures.length).toBe(1);
    expect(await parsed.verifySignatures()).toBe(true);
    expect(Buffer.from(parsed.signatures[0]?.signature ?? []).toString("hex")).toBe(
      Buffer.from(sig).toString("hex"),
    );
  });

  test("versioned: injecting the detached sig yields the same signed tx", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx().serialize();
    const sig = signTransactionDetached(kp, tx);

    const injected = await signTransactionWithDetachedSignature(tx, sig, kp.publicKey.toBase58());
    const parsed = VersionedTransaction.deserialize(injected);
    expect(parsed.signatures[0]).toEqual(sig);
  });

  test("rejects a non-64-byte signature", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    await expect(
      signTransactionWithDetachedSignature(
        await legacyTx(),
        new Uint8Array(63),
        kp.publicKey.toBase58(),
      ),
    ).rejects.toThrow();
  });
});
