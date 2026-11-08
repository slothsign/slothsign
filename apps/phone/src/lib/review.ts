import { renderEvmRequest, type EvmIntent } from "@slothsign/chain-evm";
import {
  base64ToBytes,
  payloadToMessage,
  renderSolanaRequest,
  type SolanaInstructionRender,
  type SolanaTransactionIntent,
} from "@slothsign/chain-solana";
import type { SignerRequest } from "@slothsign/core";

export interface ReviewRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface Review {
  title: string;
  rows: ReviewRow[];
  /** Set when part of the request could not be understood. */
  warning?: string;
  /** Open the full request by default when the rows don't carry the values. */
  showFullRequest?: boolean;
}

const UNKNOWN_WARNING = "This request couldn't be decoded. Only sign if you trust its source.";

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${value / base}.${fraction}` : `${value / base}`;
}

function toBigInt(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function network(request: SignerRequest): string {
  if (request.chain === "solana") return "Solana";
  const id = toBigInt(request.chainId);
  return `EVM chain ${id ?? request.chainId}`;
}

function baseRows(request: SignerRequest): ReviewRow[] {
  return [{ label: "Network", value: network(request) }];
}

function amountRow(label: string, value: bigint | undefined, decimals: number, unit: string) {
  return value === undefined
    ? []
    : [{ label, value: `${formatUnits(value, decimals)} ${unit}`.trim() }];
}

function evmTransactionRows(intent: EvmIntent): ReviewRow[] {
  const gas = toBigInt(intent.gas);
  const nonce = toBigInt(intent.nonce);
  const feeRate = toBigInt(intent.maxFeePerGas ?? intent.gasPrice);
  const maxFee = gas !== undefined && feeRate !== undefined ? gas * feeRate : undefined;
  const hasData = intent.data !== undefined && intent.data !== "0x" && intent.data !== "";
  return [
    { label: "To", value: intent.to ?? "New contract", mono: true },
    ...amountRow("Amount", toBigInt(intent.value) ?? 0n, 18, "native token"),
    ...amountRow("Max network fee", maxFee, 18, "native token"),
    ...(nonce === undefined ? [] : [{ label: "Nonce", value: nonce.toString() }]),
    ...(hasData ? [{ label: "Data (not decoded)", value: intent.data!, mono: true }] : []),
  ];
}

function reviewEvm(request: SignerRequest): Review {
  const rendered = renderEvmRequest(request);
  if (!rendered.known || !rendered.intent) {
    return {
      title: "Unknown request",
      rows: baseRows(request),
      warning: UNKNOWN_WARNING,
      showFullRequest: true,
    };
  }
  const { intent } = rendered;
  if (intent.type === "transaction") {
    return {
      title: "Sign transaction",
      rows: [...baseRows(request), ...evmTransactionRows(intent)],
    };
  }
  if (intent.type === "message") {
    return {
      title: "Sign message",
      rows: [...baseRows(request), { label: "Message", value: intent.message ?? "" }],
    };
  }
  const typed = intent.typedData;
  return {
    title: "Sign typed data",
    rows: [
      ...baseRows(request),
      { label: "Domain", value: typed?.domainName ?? "Unknown" },
      { label: "Type", value: typed?.primaryType ?? "Unknown" },
      ...(typed?.verifyingContract
        ? [{ label: "Contract", value: typed.verifyingContract, mono: true }]
        : []),
    ],
    showFullRequest: true,
  };
}

function instructionRow(instruction: SolanaInstructionRender, index: number): ReviewRow {
  const label = `Instruction ${index + 1}`;
  if (!instruction.known) {
    return {
      label,
      value: `Unknown program ${instruction.programId}\n${instruction.dataLength} bytes of data`,
      mono: true,
    };
  }
  const { program, action, data, accounts } = instruction.intent;
  const lines = [`${program}: ${action}`];
  if (data) lines.push(data);
  if (accounts?.length) lines.push(...accounts);
  return { label, value: lines.join("\n"), mono: true };
}

function solanaTransactionReview(request: SignerRequest, intent: SolanaTransactionIntent): Review {
  const { feePayer, instructions, unknownCount } = intent;
  return {
    title: "Sign transaction",
    rows: [
      ...baseRows(request),
      ...(feePayer ? [{ label: "Fee payer", value: feePayer, mono: true }] : []),
      ...instructions.map(instructionRow),
    ],
    warning:
      unknownCount > 0
        ? `${unknownCount} of ${instructions.length} instructions couldn't be decoded. Only sign if you trust its source.`
        : undefined,
  };
}

function solanaMessageText(request: SignerRequest): string | undefined {
  try {
    const { message } = payloadToMessage(request.payload);
    return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(message));
  } catch {
    return undefined;
  }
}

function reviewSolana(request: SignerRequest): Review {
  if (request.type === "message") {
    const text = solanaMessageText(request);
    if (text !== undefined) {
      return {
        title: "Sign message",
        rows: [...baseRows(request), { label: "Message", value: text }],
      };
    }
  }
  const rendered = renderSolanaRequest(request);
  if (!rendered.known || !rendered.intent) {
    return {
      title: "Unknown request",
      rows: baseRows(request),
      warning: UNKNOWN_WARNING,
      showFullRequest: true,
    };
  }
  return solanaTransactionReview(request, rendered.intent);
}

export function reviewRequest(request: SignerRequest): Review {
  return request.chain === "ethereum" ? reviewEvm(request) : reviewSolana(request);
}

/** The whole request, with a JSON payload expanded so its values are readable. */
export function fullRequestText(request: SignerRequest): string {
  let payload: unknown = request.payload;
  try {
    payload = JSON.parse(request.payload);
  } catch {
    // Binary payloads stay as their base64 string.
  }
  return JSON.stringify({ ...request, payload }, null, 2);
}
