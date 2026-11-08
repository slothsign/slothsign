import { describe, expect, test } from "bun:test";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  type Blockhash,
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

function randomKey(): PublicKey {
  return new PublicKey(crypto.getRandomValues(new Uint8Array(32)));
}

describe("renderSolanaRequest", () => {
  test("renders a legacy system transfer", async () => {
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
    const result = renderSolanaRequest(request(await tx.serialize({ verifySignatures: false })));
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
