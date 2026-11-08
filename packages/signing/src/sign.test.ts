import { describe, expect, test } from "bun:test";
import { evmRequestToSignerRequest } from "@slothsign/chain-evm";
import {
  base64ToBytes,
  bytesToBase64,
  keypairFromMnemonic,
  solanaRequestToSignerRequest,
} from "@slothsign/chain-solana";
import { PublicKey, SystemProgram, Transaction, type Blockhash } from "@solana/web3.js";
import { signRequest } from "./sign.ts";
import { DEFAULT_PATHS, walletEntries, type MnemonicWallet, type Wallet } from "./wallets.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const EVM_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const [EVM_PATH, SOLANA_PATH] = DEFAULT_PATHS as [string, string];

const WALLET: MnemonicWallet = {
  id: "main",
  kind: "mnemonic",
  mnemonic: MNEMONIC,
  passphrase: "",
  paths: DEFAULT_PATHS,
};

function evmMessageRequest(address = EVM_ADDRESS) {
  return evmRequestToSignerRequest("personal_sign", ["Hello", address], "0x1");
}

async function solanaTransfer() {
  const keypair = keypairFromMnemonic(MNEMONIC, SOLANA_PATH);
  const serialized = await new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: "11111111111111111111111111111111" as Blockhash,
  })
    .add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey("Vote111111111111111111111111111111111111111"),
        lamports: 1000,
      }),
    )
    .serialize({ requireAllSignatures: false, verifySignatures: false });
  return solanaRequestToSignerRequest("signTransaction", {
    transaction: new Uint8Array(serialized),
    publicKey: keypair.publicKey.toBase58(),
  });
}

describe("walletEntries", () => {
  test("derives one address per declared path", () => {
    const entries = walletEntries({ version: 1, wallets: [WALLET] });
    expect(entries.map((e) => e.keyId)).toEqual([`main:${EVM_PATH}`, `main:${SOLANA_PATH}`]);
    expect(entries[0]?.address).toBe(EVM_ADDRESS);
  });
});

describe("signRequest", () => {
  test("signs an EVM message with the key at the declared path", async () => {
    const signature = await signRequest(evmMessageRequest(), WALLET, EVM_PATH);
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  test("accepts an EVM address in any case", async () => {
    const lower = evmMessageRequest(EVM_ADDRESS.toLowerCase());
    expect(await signRequest(lower, WALLET, EVM_PATH)).toMatch(/^0x/);
  });

  test("refuses when the key does not derive the requested address", async () => {
    const other = evmMessageRequest("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    await expect(signRequest(other, WALLET, EVM_PATH)).rejects.toThrow("Address mismatch");
  });

  test("returns the full signed Solana transaction by default", async () => {
    const request = await solanaTransfer();
    const result = base64ToBytes(await signRequest(request, WALLET, SOLANA_PATH));
    expect(result.length).toBe(base64ToBytes(request.payload).length);
  });

  test("returns a detached 64-byte Solana signature on request", async () => {
    const result = await signRequest(await solanaTransfer(), WALLET, SOLANA_PATH, {
      detachedSolanaTransaction: true,
    });
    expect(base64ToBytes(result).length).toBe(64);
  });

  test("refuses typed data on Solana", async () => {
    const request = { ...(await solanaTransfer()), type: "typedData" as const };
    await expect(signRequest(request, WALLET, SOLANA_PATH)).rejects.toThrow("typedData");
  });

  test("signs with a raw private key wallet", async () => {
    const wallet: Wallet = {
      id: "raw",
      kind: "privateKey",
      chain: "ethereum",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    };
    expect(await signRequest(evmMessageRequest(), wallet, undefined)).toMatch(/^0x/);
  });

  test("result is valid base64 for a Solana message", async () => {
    const keypair = keypairFromMnemonic(MNEMONIC, SOLANA_PATH);
    const request = solanaRequestToSignerRequest("signMessage", {
      message: new TextEncoder().encode("Hello"),
      publicKey: keypair.publicKey.toBase58(),
    });
    const result = await signRequest(request, WALLET, SOLANA_PATH);
    expect(bytesToBase64(base64ToBytes(result))).toBe(result);
  });
});
