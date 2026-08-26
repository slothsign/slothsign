import { describe, expect, test } from "bun:test";
import {
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
} from "@solana/web3.js";
import { keypairFromMnemonic } from "./signer.ts";
import { renderSolanaRequest } from "./render.ts";
import { bytesToBase64 } from "./payload.ts";

const MNEMONIC = "repair item secret false deliver skin salmon guard inspire pill lesson adult";

function request(serialized: Uint8Array) {
  const kp = keypairFromMnemonic(MNEMONIC);
  return {
    version: 1,
    chain: "solana",
    chainId: "mainnet",
    address: kp.publicKey.toBase58(),
    type: "transaction",
    payload: bytesToBase64(serialized),
  } as const;
}

describe("renderSolanaRequest", () => {
  test("renders a legacy system transfer", () => {
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
    const result = renderSolanaRequest(request(tx.serialize({ verifySignatures: false })));
    expect(result.known).toBe(true);
    if (!result.known) return;
    expect(result.intent?.instructions[0]).toMatchObject({
      known: true,
      intent: { program: "System", action: "Transfer" },
    });
  });

  test("renders a versioned system transfer", () => {
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
    const tx = new VersionedTransaction(message);
    const result = renderSolanaRequest(request(tx.serialize()));
    expect(result.known).toBe(true);
    if (!result.known) return;
    expect(result.intent?.feePayer).toBe(kp.publicKey.toBase58());
    expect(result.intent?.instructions[0]).toMatchObject({
      known: true,
      intent: { program: "System", action: "Transfer" },
    });
  });

  test("marks non-transaction types unknown", () => {
    const req = request(new Uint8Array(0));
    const result = renderSolanaRequest({ ...req, type: "message", payload: "{}" });
    expect(result.known).toBe(false);
  });
});
