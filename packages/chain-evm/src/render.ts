import type { SignerRequest } from "@slothsign/core";
import { hexToString, type Hex } from "viem";
import { payloadToMessage, payloadToTx, payloadToTypedData } from "./payload.ts";

export interface EvmIntent {
  type: SignerRequest["type"];
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  nonce?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  message?: string;
  typedData?: {
    domainName?: string;
    domainVersion?: string;
    primaryType?: string;
    verifyingContract?: string;
    fieldCount?: number;
  };
}

export interface EvmRenderResult {
  known: boolean;
  intent?: EvmIntent;
  reason?: string;
}

/**
 * Render a SignerRequest into a human-readable intent.
 * Never fabricates understanding: undecodable payloads stay unknown.
 */
export function renderEvmRequest(request: SignerRequest): EvmRenderResult {
  if (request.chain !== "ethereum") return { known: false, reason: "Not an EVM request" };
  try {
    switch (request.type) {
      case "transaction": {
        const tx = payloadToTx(request.payload);
        return {
          known: true,
          intent: {
            type: "transaction",
            to: tx.to,
            value: tx.value,
            data: tx.data,
            gas: tx.gas,
            nonce: tx.nonce,
            gasPrice: tx.gasPrice,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          },
        };
      }
      case "message": {
        const { message } = payloadToMessage(request.payload);
        return {
          known: true,
          intent: {
            type: "message",
            message: displayMessage(message),
          },
        };
      }
      case "typedData": {
        const { typedData } = payloadToTypedData(request.payload);
        const domain = typedData.domain as Record<string, unknown> | undefined;
        const types = typedData.types as Record<string, unknown> | undefined;
        const primaryType =
          typeof typedData.primaryType === "string" ? typedData.primaryType : undefined;
        const fields = primaryType && types ? types[primaryType] : undefined;
        const fieldCount = Array.isArray(fields) ? fields.length : 0;
        return {
          known: true,
          intent: {
            type: "typedData",
            typedData: {
              domainName: typeof domain?.name === "string" ? domain.name : undefined,
              domainVersion: typeof domain?.version === "string" ? domain.version : undefined,
              verifyingContract:
                typeof domain?.verifyingContract === "string"
                  ? domain.verifyingContract
                  : undefined,
              primaryType,
              fieldCount,
            },
          },
        };
      }
    }
  } catch {
    return { known: false, reason: "Unable to decode EVM payload" };
  }
}

function displayMessage(message: string): string {
  try {
    return hexToString(message as Hex);
  } catch {
    return message;
  }
}
