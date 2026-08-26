import { describe, expect, test } from "bun:test";
import {
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
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

function legacyTx(): Uint8Array {
  const kp = keypairFromMnemonic(MNEMONIC);
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 100,
    }),
  );
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.feePayer = kp.publicKey;
  return tx.serialize({ verifySignatures: false });
}

function versionedTx(): VersionedTransaction {
  const kp = keypairFromMnemonic(MNEMONIC);
  const message = new TransactionMessage({
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    payerKey: kp.publicKey,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 100,
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe("keypairFromMnemonic", () => {
  test("derives the expected public key (SLIP-0010)", () => {
    expect(keypairFromMnemonic(MNEMONIC).publicKey.toBase58()).toBe(ADDRESS);
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
  test("signs and returns a verifiable legacy transaction", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = legacyTx();
    const signed = signTransaction(kp, tx);
    const parsed = Transaction.from(signed);
    expect(parsed.signatures.length).toBe(1);
    expect(parsed.signatures[0]?.signature).not.toBeNull();
    expect(parsed.verifySignatures()).toBe(true);
  });
});

describe("signTransaction (versioned)", () => {
  test("auto-detects versioned transactions", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx();
    const signed = signTransaction(kp, tx.serialize());
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures.length).toBe(1);
    expect(parsed.signatures[0]).not.toEqual(new Uint8Array(64));
  });

  test("signed versioned tx carries a 64-byte signature", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx();
    const signed = signTransaction(kp, tx.serialize());
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
    const valid = await import("@noble/ed25519").then((m) =>
      m.verifyAsync(sig, message, kp.publicKey.toBytes()),
    );
    expect(valid).toBe(true);
  });
});

describe("signMessageFromPayload", () => {
  test("signs the base64-encoded message in the payload", async () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const message = new TextEncoder().encode("0xdeadbeef");
    const payload = JSON.stringify({ message: bytesToBase64(message), publicKey: ADDRESS });
    const sig = await signMessageFromPayload(kp, payload);
    const valid = await import("@noble/ed25519").then((m) =>
      m.verifyAsync(sig, message, kp.publicKey.toBytes()),
    );
    expect(valid).toBe(true);
    expect(base64ToBytes).toBeDefined();
  });
});

describe("signTransactionDetached", () => {
  test("legacy: returns a 64-byte signature that matches the signed tx", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = legacyTx();
    const sig = signTransactionDetached(kp, tx);

    expect(sig.length).toBe(64);

    const signed = signTransaction(kp, tx);
    const parsed = Transaction.from(signed);
    expect(parsed.signatures.length).toBe(1);
    expect(Buffer.from(parsed.signatures[0]?.signature ?? []).toString("hex")).toBe(
      Buffer.from(sig).toString("hex"),
    );
    expect(parsed.verifySignatures()).toBe(true);
  });

  test("versioned: returns a 64-byte signature that matches the signed tx", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx().serialize();
    const sig = signTransactionDetached(kp, tx);

    expect(sig.length).toBe(64);

    const signed = signTransaction(kp, tx);
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures[0]).toEqual(sig);
  });
});

describe("extractSignature", () => {
  test("legacy: extracts the 64-byte signature from a signed transaction", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const signed = signTransaction(kp, legacyTx());
    const sig = extractSignature(signed);
    expect(sig.length).toBe(64);
    const parsed = Transaction.from(signed);
    expect(Buffer.from(sig).toString("hex")).toBe(
      Buffer.from(parsed.signatures[0]?.signature ?? []).toString("hex"),
    );
  });

  test("versioned: extracts the 64-byte signature from a signed transaction", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const signed = signTransaction(kp, versionedTx().serialize());
    const sig = extractSignature(signed);
    expect(sig.length).toBe(64);
    const parsed = VersionedTransaction.deserialize(signed);
    expect(parsed.signatures[0]).toEqual(sig);
  });

  test("matches the detached signature for the same key", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = legacyTx();
    const detached = signTransactionDetached(kp, tx);
    const sig = extractSignature(signTransaction(kp, tx));
    expect(Buffer.from(sig).toString("hex")).toBe(Buffer.from(detached).toString("hex"));
  });
});

describe("signTransactionWithDetachedSignature", () => {
  test("legacy: injecting the detached sig yields the same signed tx", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = legacyTx();
    const sig = signTransactionDetached(kp, tx);

    const injected = signTransactionWithDetachedSignature(tx, sig, kp.publicKey.toBase58());
    const parsed = Transaction.from(injected);
    expect(parsed.signatures.length).toBe(1);
    expect(parsed.verifySignatures()).toBe(true);
    expect(Buffer.from(parsed.signatures[0]?.signature ?? []).toString("hex")).toBe(
      Buffer.from(sig).toString("hex"),
    );
  });

  test("versioned: injecting the detached sig yields the same signed tx", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    const tx = versionedTx().serialize();
    const sig = signTransactionDetached(kp, tx);

    const injected = signTransactionWithDetachedSignature(tx, sig, kp.publicKey.toBase58());
    const parsed = VersionedTransaction.deserialize(injected);
    expect(parsed.signatures[0]).toEqual(sig);
  });

  test("rejects a non-64-byte signature", () => {
    const kp = keypairFromMnemonic(MNEMONIC);
    expect(() =>
      signTransactionWithDetachedSignature(legacyTx(), new Uint8Array(63), kp.publicKey.toBase58()),
    ).toThrow();
  });
});
