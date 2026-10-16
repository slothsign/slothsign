import { useMemo, useState } from "react";
import { Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelRequest, trezorSign } from "@/webext/actions";
import { defaultPath } from "@/lib/derivation";
import { evmGasInfo, gasBlockedReason } from "@/lib/evm-gas";
import type { SignPendingRequest } from "@/lib/requests";
import type { WalletConfig } from "@/lib/types";

export function TrezorView({
  request,
  wallet,
}: {
  request: SignPendingRequest;
  wallet?: WalletConfig;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const rawJson = useMemo(
    () => JSON.stringify(request.signerRequest, null, 2),
    [request.signerRequest],
  );

  // Trezor firmware cannot sign Solana off-chain messages.
  const unsupported =
    request.chain === "solana" && request.signerRequest?.type !== "transaction"
      ? "Trezor cannot sign Solana messages. Ask the dApp for a transaction, or use a different signer."
      : undefined;
  const gasBlocked = gasBlockedReason(evmGasInfo(request));

  if (unsupported) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {unsupported}
        </div>
        <Button variant="outline" className="w-full" onClick={() => cancelRequest(request.id)}>
          Cancel
        </Button>
      </div>
    );
  }

  async function sign() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const res = await trezorSign(request.id);
      if (!res.ok) throw new Error(res.error ?? "Trezor signing failed");
      // On success the background resolves the request and this window closes.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <details className="rounded-md border border-border p-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Raw data
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-snug text-muted-foreground">
          {rawJson}
        </pre>
      </details>
      {gasBlocked ? (
        <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {gasBlocked}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button
        size="lg"
        className="w-full"
        disabled={pending || gasBlocked !== undefined}
        onClick={() => void sign()}
      >
        <Usb className="size-4" />
        {pending ? "Waiting for Trezor…" : "Sign with Trezor"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Check the request above, then confirm on your device · path{" "}
        <span className="font-mono">{wallet?.path || defaultPath(request.chain)}</span>
      </p>
      <Button variant="outline" className="w-full" onClick={() => cancelRequest(request.id)}>
        Cancel
      </Button>
    </div>
  );
}
