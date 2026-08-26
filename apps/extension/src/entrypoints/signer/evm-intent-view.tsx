import { renderEvmRequest } from "@slothsign/chain-evm";
import { formatGwei, hexToBigInt, type Hex } from "viem";
import { shortAddress } from "@/lib/util";
import type { SignPendingRequest } from "@/lib/requestStore";
import { DataTable, type TableItem } from "@/components/row";
import { DecodeError } from "./decode-error";

function formatGasFee(intent: {
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}): string | undefined {
  const fee = intent.maxFeePerGas ?? intent.gasPrice;
  if (!fee) return undefined;
  return `${formatGwei(hexToBigInt(fee as Hex))} gwei`;
}

export function EvmIntentView({ request }: { request: SignPendingRequest }) {
  const rendered = renderEvmRequest(request.signerRequest!);
  const base: TableItem[] = [
    { label: "Address", value: shortAddress(request.address), mono: true },
    { label: "Signing for", value: request.origin },
  ];
  if (!rendered.known || !rendered.intent) {
    return (
      <DataTable
        items={[
          ...base,
          {
            label: "",
            value: <DecodeError reason={rendered.reason} />,
          },
        ]}
      />
    );
  }
  const intent = rendered.intent;
  if (intent.type === "transaction") {
    const gasFee = formatGasFee(intent);
    return (
      <DataTable
        items={[
          ...base,
          { label: "To", value: intent.to ?? "—", mono: true },
          { label: "Value", value: intent.value ?? "0" },
          ...(intent.nonce
            ? [{ label: "Nonce", value: String(hexToBigInt(intent.nonce as Hex)) }]
            : []),
          ...(intent.gas ? [{ label: "Gas", value: intent.gas }] : []),
          ...(gasFee ? [{ label: "Gas fee", value: gasFee }] : []),
          ...(intent.data
            ? [
                {
                  label: "Data",
                  value: (
                    <details className="min-w-0">
                      <summary className="cursor-pointer font-mono text-muted-foreground">
                        View data
                      </summary>
                      <span className="block break-all font-mono">{intent.data}</span>
                    </details>
                  ),
                },
              ]
            : []),
        ]}
      />
    );
  }
  if (intent.type === "message") {
    return (
      <DataTable
        items={[
          ...base,
          {
            label: "Message",
            value: (
              <div className="min-w-0 break-all whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 text-sm">
                {intent.message}
              </div>
            ),
          },
        ]}
      />
    );
  }
  const td = intent.typedData!;
  return (
    <DataTable
      items={[
        ...base,
        { label: "Domain", value: td.domainName ?? "—" },
        { label: "Version", value: td.domainVersion ?? "—" },
        { label: "Primary type", value: td.primaryType ?? "—" },
        { label: "Fields", value: String(td.fieldCount ?? 0) },
        ...(td.verifyingContract
          ? [{ label: "Contract", value: td.verifyingContract, mono: true }]
          : []),
      ]}
    />
  );
}
