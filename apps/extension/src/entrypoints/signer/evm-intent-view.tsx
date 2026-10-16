import type { ReactNode } from "react";
import { renderEvmRequest } from "@slothsign/chain-evm";
import { RefreshCw } from "lucide-react";
import { formatGwei, hexToBigInt, type Hex } from "viem";
import { refreshGas } from "@/webext/actions";
import { evmGasInfo, type EvmGasInfo } from "@/lib/evm-gas";
import { shortAddress } from "@/lib/util";
import type { SignPendingRequest } from "@/lib/requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function gasValue(gas: EvmGasInfo): ReactNode {
  if (gas.value) return <span className="font-mono">{formatGasLimit(gas.value)}</span>;
  if (gas.fetching) return <span className="text-muted-foreground">Estimating…</span>;
  return (
    <span className="text-destructive" title={gas.error}>
      unavailable
    </span>
  );
}

function formatGasLimit(value: string): string {
  try {
    return hexToBigInt(value as Hex).toString();
  } catch {
    return value;
  }
}

/** The always-present Gas row: value, provenance badge, and a refresh button. */
function GasLimit({ request }: { request: SignPendingRequest }) {
  const gas = evmGasInfo(request);
  return (
    <div className="flex items-center gap-2">
      {gasValue(gas)}
      {gas.estimated ? <Badge variant="secondary">estimated</Badge> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Refresh gas estimate"
        title="Refresh gas estimate"
        disabled={gas.fetching}
        onClick={() => void refreshGas(request.id)}
      >
        <RefreshCw className={gas.fetching ? "animate-spin" : undefined} />
      </Button>
    </div>
  );
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
          { label: "Gas", value: <GasLimit request={request} /> },
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
