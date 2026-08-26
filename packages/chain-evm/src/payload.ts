import type { SignerRequest } from "@slothsign/core";
import { z } from "zod";

export type EvmMethod = "eth_sendTransaction" | "personal_sign" | "eth_signTypedData_v4";

export const EvmTransactionPayloadSchema = z
  .object({
    from: z.string(),
    to: z.string().optional(),
    value: z.string().optional(),
    data: z.string().optional(),
    nonce: z.string().optional(),
    gas: z.string().optional(),
    gasPrice: z.string().optional(),
    maxFeePerGas: z.string().optional(),
    maxPriorityFeePerGas: z.string().optional(),
    chainId: z.string().optional(),
  })
  .passthrough();

export type EvmTransactionPayload = z.infer<typeof EvmTransactionPayloadSchema>;

export const EvmMessagePayloadSchema = z.object({
  message: z.string(),
  address: z.string(),
});

export type EvmMessagePayload = z.infer<typeof EvmMessagePayloadSchema>;

export const EvmTypedDataPayloadSchema = z.object({
  address: z.string(),
  typedData: z.record(z.string(), z.unknown()),
});

export type EvmTypedDataPayload = z.infer<typeof EvmTypedDataPayloadSchema>;

export function methodToRequestType(method: EvmMethod): SignerRequest["type"] {
  switch (method) {
    case "eth_sendTransaction":
      return "transaction";
    case "personal_sign":
      return "message";
    case "eth_signTypedData_v4":
      return "typedData";
  }
}

export function txToPayload(tx: EvmTransactionPayload): string {
  return JSON.stringify(tx);
}

export function payloadToTx(payload: string): EvmTransactionPayload {
  return parsePayload(payload, EvmTransactionPayloadSchema, "Invalid EVM transaction payload");
}

export function messageToPayload(message: string, address: string): string {
  return JSON.stringify({ message, address } satisfies EvmMessagePayload);
}

export function payloadToMessage(payload: string): EvmMessagePayload {
  return parsePayload(payload, EvmMessagePayloadSchema, "Invalid EVM message payload");
}

export function typedDataToPayload(address: string, typedData: Record<string, unknown>): string {
  return JSON.stringify({ address, typedData } satisfies EvmTypedDataPayload);
}

export function payloadToTypedData(payload: string): EvmTypedDataPayload {
  return parsePayload(payload, EvmTypedDataPayloadSchema, "Invalid EVM typed data payload");
}

function parsePayload<T>(payload: string, schema: z.ZodType<T>, errorMessage: string): T {
  const parsed = JSON.parse(payload) as unknown;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(errorMessage);
  }
  return result.data;
}
