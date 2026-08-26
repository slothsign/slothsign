import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelRequest, confirmConnect } from "@/lib/actions";
import { CHAIN_LABELS, type WalletConfig } from "@/lib/config";
import type { ConnectPendingRequest } from "@/lib/requestStore";

export function ConnectApprovalView({
  request,
  wallets,
}: {
  request: ConnectPendingRequest;
  wallets: WalletConfig[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const accounts = useMemo(
    () =>
      request.accounts.map((address) => {
        const wallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
        return { address, label: wallet?.label ?? "" };
      }),
    [request.accounts, wallets],
  );

  async function approve() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await confirmConnect(request.id);
      if (!result.ok) setError(result.error ?? "Connection failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    setBusy(true);
    void cancelRequest(request.id).finally(() => setBusy(false));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="text-muted-foreground">Connecting:</span>{" "}
        <span className="font-medium">{request.origin}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        This site is requesting access to your {CHAIN_LABELS[request.chain]} account(s):
      </p>
      {accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No wallets configured for this chain.</p>
      ) : (
        <ul className="space-y-1">
          {accounts.map((w) => (
            <li key={w.address} className="rounded-md border border-border bg-muted/50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-all text-sm font-medium">
                  {w.label || "Unnamed"}
                </span>
                <Badge
                  variant={request.chain === "ethereum" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {CHAIN_LABELS[request.chain]}
                </Badge>
              </div>
              <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                {w.address}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || accounts.length === 0} onClick={approve}>
          Connect
        </Button>
        <Button variant="outline" className="flex-1" disabled={busy} onClick={decline}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
