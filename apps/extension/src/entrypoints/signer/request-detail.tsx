import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { SignMode } from "@/components/sign-mode-icon.tsx";
import { cancelRequest } from "@/lib/actions";
import { CHAIN_LABELS, isSignableWallet, walletForAddress, type WalletConfig } from "@/lib/config";
import type { PendingRequest } from "@/lib/requestStore";
import { shortAddress } from "@/lib/util";
import { ConnectApprovalView } from "./connect-approval-view";
import { EvmIntentView } from "./evm-intent-view";
import { QrSignFlow } from "./qr-sign-flow";
import { DataTable } from "@/components/row";
import { SolanaIntentView } from "./solana-intent-view";
import { TrezorView } from "./trezor-view";

export function RequestDetail({
  request,
  wallets,
}: {
  request: PendingRequest;
  wallets: WalletConfig[];
}) {
  if (request.kind === "connect") {
    return <ConnectApprovalView request={request} wallets={wallets} />;
  }
  const wallet = walletForAddress(wallets, request);
  const signable = isSignableWallet(wallet);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={request.chain === "ethereum" ? "default" : "secondary"}>
          {CHAIN_LABELS[request.chain]}
        </Badge>
        <Badge variant="outline">{request.method}</Badge>
        <Badge variant="secondary">
          <SignMode signer={request.signer} />
        </Badge>
      </div>
      {!signable ? (
        <div className="space-y-3">
          <DataTable
            items={[
              { label: "Address", value: shortAddress(request.address), mono: true },
              { label: "Signing for", value: request.origin },
            ]}
          />
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This wallet is watch-only. To enable signing, add a derivation path and extended public
            key (xpub) for the wallet.
          </div>
          <Button variant="outline" className="w-full" onClick={() => cancelRequest(request.id)}>
            Cancel
          </Button>
        </div>
      ) : request.signer === "keystone-qr" || request.signer === "address-qr" ? (
        <QrSignFlow request={request} wallet={wallet} />
      ) : (
        <>
          <Separator />
          <div>
            {request.chain === "ethereum" ? (
              <EvmIntentView request={request} />
            ) : (
              <SolanaIntentView request={request} />
            )}
          </div>
          <Separator />
          <TrezorView request={request} />
        </>
      )}
    </div>
  );
}
