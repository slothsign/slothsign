import type { Hex, TransactionSerializable } from "viem";
import { serializeTransaction } from "viem";
import type { EvmTransactionPayload } from "./payload.ts";

export function evmSerializable(
  tx: EvmTransactionPayload,
  chainId: string,
): TransactionSerializable {
  const typed = isTypedTransaction(tx);
  const base = {
    chainId: Number(BigInt(chainId)),
    nonce: numField(tx.nonce),
    gas: numField(tx.gas),
    to: hexField(tx.to),
    value: numField(tx.value) ?? 0n,
    data: hexField(tx.data, "0x0"),
  };
  return (
    typed
      ? {
          ...base,
          type: "eip1559",
          maxFeePerGas: numField(tx.maxFeePerGas),
          maxPriorityFeePerGas: numField(tx.maxPriorityFeePerGas),
        }
      : {
          ...base,
          type: "legacy",
          gasPrice: numField(tx.gasPrice),
        }
  ) as TransactionSerializable;
}

export function serializeEvmTransaction(tx: EvmTransactionPayload, chainId: string): string {
  return serializeTransaction(evmSerializable(tx, chainId)).slice(2);
}

export function isTypedTransaction(tx: EvmTransactionPayload): boolean {
  if (tx.type === "0x2" || tx.type === "0x02") return true;
  if (tx.type === "0x0" || tx.type === "0x1" || tx.type === "0x00" || tx.type === "0x01") {
    return false;
  }
  return tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined;
}

export function numField(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  return BigInt(value.startsWith("0x") ? value : `0x${value}`);
}

export function hexField(value: string | undefined, fallback?: string): Hex | undefined {
  if (!value) return fallback as Hex | undefined;
  return value.startsWith("0x") ? (value as Hex) : (`0x${value}` as Hex);
}
