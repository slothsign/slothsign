import { renderSolanaRequest } from "@slothsign/chain-solana";
import { shortAddress } from "@/lib/util";
import type { SignPendingRequest } from "@/lib/requestStore";
import { DataTable } from "@/components/row";
import { DecodeError } from "./decode-error";

export function SolanaIntentView({ request }: { request: SignPendingRequest }) {
  const rendered = renderSolanaRequest(request.signerRequest!);
  const header = (
    <DataTable
      items={[
        { label: "Address", value: shortAddress(request.address), mono: true },
        { label: "Signing for", value: request.origin },
      ]}
    />
  );
  if (!rendered.known || !rendered.intent) {
    return (
      <div className="space-y-2">
        {header}
        <DecodeError reason={rendered.reason} />
      </div>
    );
  }
  const { instructions, unknownCount } = rendered.intent;
  return (
    <div className="space-y-2 text-sm">
      {header}
      {instructions.map((ix, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 break-all">
              {ix.known
                ? `${ix.intent.program} · ${ix.intent.action}`
                : `Unknown program ${ix.programId}`}
            </span>
          </div>
          {ix.known && ix.intent.data ? (
            <p className="break-all text-xs text-muted-foreground">{ix.intent.data}</p>
          ) : null}
        </div>
      ))}
      {unknownCount > 0 ? (
        <p className="text-xs text-destructive">{unknownCount} unknown instruction(s)</p>
      ) : null}
    </div>
  );
}
