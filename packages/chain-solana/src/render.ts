import type { SignerRequest } from "@slothsign/core";
import {
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { isVersionedTransaction } from "./signer.ts";
import { payloadToTransactionBytes } from "./adapter.ts";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUPITER_PROGRAM_ID = "JUP6LrZQjECt9GUmRjcf3pr4xMGLmB9qfKcV1JjQ9fV";

export interface SolanaInstructionIntent {
  program: string;
  action: string;
  accounts?: string[];
  data?: string;
}

export type SolanaInstructionRender =
  | { known: true; intent: SolanaInstructionIntent }
  | { known: false; programId: string; accounts: string[]; dataLength: number };

export interface SolanaTransactionIntent {
  signers: string[];
  feePayer?: string;
  recentBlockhash?: string;
  instructions: SolanaInstructionRender[];
  unknownCount: number;
}

export interface SolanaRenderResult {
  known: boolean;
  intent?: SolanaTransactionIntent;
  reason?: string;
}

interface Decoder {
  (ix: {
    programId: string;
    accounts: { publicKey: string }[];
    data: Uint8Array;
    dataLength: number;
  }): SolanaInstructionIntent | null;
}

const systemDecoders: Partial<Record<number, Decoder>> = {
  2: (ix) => {
    const [from, to] = ix.accounts.map((a) => a.publicKey);
    const lamports = new DataView(ix.data.buffer, ix.data.byteOffset + 4, 8).getBigUint64(0, true);
    return {
      program: "System",
      action: "Transfer",
      accounts: [from!, to!],
      data: `${Number(lamports) / LAMPORTS_PER_SOL} SOL`,
    };
  },
  0: () => ({ program: "System", action: "CreateAccount" }),
  3: () => ({ program: "System", action: "Assign" }),
  4: () => ({ program: "System", action: "TransferWithSeed" }),
  5: () => ({ program: "System", action: "AdvanceNonceAccount" }),
  6: () => ({ program: "System", action: "WithdrawNonceAccount" }),
  7: () => ({ program: "System", action: "InitializeNonceAccount" }),
  8: () => ({ program: "System", action: "AuthorizeNonceAccount" }),
  9: () => ({ program: "System", action: "Allocate" }),
  10: () => ({ program: "System", action: "AllocateWithSeed" }),
  11: () => ({ program: "System", action: "AssignWithSeed" }),
};

const tokenDecoders: Partial<Record<number, Decoder>> = {
  3: (ix) => {
    const amount = new DataView(ix.data.buffer, ix.data.byteOffset + 4, 8).getBigUint64(0, true);
    return {
      program: "Token",
      action: "Transfer",
      accounts: ix.accounts.map((a) => a.publicKey),
      data: `${amount} (raw units)`,
    };
  },
  4: () => ({ program: "Token", action: "Approve" }),
  6: () => ({ program: "Token", action: "MintTo" }),
  8: () => ({ program: "Token", action: "Burn" }),
  9: () => ({ program: "Token", action: "CloseAccount" }),
  12: () => ({ program: "Token", action: "SetAuthority" }),
  15: () => ({ program: "Token", action: "SyncNative" }),
};

function decodeInstruction(ix: {
  programId: string;
  accounts: { publicKey: string }[];
  data: Uint8Array;
  dataLength: number;
}): SolanaInstructionRender {
  const { programId, accounts, data, dataLength } = ix;
  const discriminator =
    dataLength > 0 ? new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true) : -1;
  let decoder: Decoder | undefined;
  if (programId === SYSTEM_PROGRAM_ID) decoder = systemDecoders[discriminator];
  else if (programId === TOKEN_PROGRAM_ID) decoder = tokenDecoders[discriminator];
  else if (programId === JUPITER_PROGRAM_ID) {
    return {
      known: true,
      intent: { program: "Jupiter", action: "Swap", accounts: accounts.map((a) => a.publicKey) },
    };
  }
  const decoded = decoder ? decoder(ix) : null;
  if (decoded) return { known: true, intent: decoded };
  return { known: false, programId, accounts: accounts.map((a) => a.publicKey), dataLength };
}

function renderInstructions(
  instructions: {
    programId: string;
    accounts: { publicKey: string }[];
    data: Uint8Array;
    dataLength: number;
  }[],
): SolanaInstructionRender[] {
  return instructions.map((ix) => decodeInstruction(ix));
}

/**
 * Deserialize and render a Solana transaction into human-readable intent.
 * Undecodable instructions are explicitly marked unknown, never assumed.
 */
export function renderSolanaRequest(request: SignerRequest): SolanaRenderResult {
  if (request.chain !== "solana") return { known: false, reason: "Not a Solana request" };
  if (request.type !== "transaction")
    return { known: false, reason: "Only transactions are rendered" };
  try {
    const serialized = payloadToTransactionBytes(request.payload);
    if (isVersionedTransaction(serialized)) {
      const tx = VersionedTransaction.deserialize(serialized);
      const message = TransactionMessage.decompile(tx.message);
      const instructions = renderInstructions(
        message.instructions.map((ix) => ({
          programId: ix.programId.toBase58(),
          accounts: ix.keys.map((k) => ({ publicKey: k.pubkey.toBase58() })),
          data: ix.data,
          dataLength: ix.data.length,
        })),
      );
      return {
        known: true,
        intent: {
          signers: tx.signatures.filter((sig) => sig.length > 0).length > 0 ? ["<provided>"] : [],
          feePayer: message.payerKey?.toBase58(),
          recentBlockhash: message.recentBlockhash,
          instructions,
          unknownCount: instructions.filter((i) => !i.known).length,
        },
      };
    }
    const tx = Transaction.from(serialized);
    const instructions = renderInstructions(
      (
        tx.instructions as unknown as {
          programId: { toBase58(): string };
          keys: { pubkey: { toBase58(): string } }[];
          data: Uint8Array;
        }[]
      ).map((raw) => ({
        programId: raw.programId.toBase58(),
        accounts: raw.keys.map((k) => ({ publicKey: k.pubkey.toBase58() })),
        data: raw.data,
        dataLength: raw.data.length,
      })),
    );
    const signers = tx.signatures
      .filter((sig) => sig.signature !== null)
      .map((sig) => sig.publicKey.toBase58());
    return {
      known: true,
      intent: {
        signers,
        feePayer: tx.feePayer?.toBase58(),
        recentBlockhash: tx.recentBlockhash,
        instructions,
        unknownCount: instructions.filter((i) => !i.known).length,
      },
    };
  } catch (error) {
    return { known: false, reason: `Unable to deserialize transaction: ${String(error)}` };
  }
}

export { SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID, JUPITER_PROGRAM_ID };
