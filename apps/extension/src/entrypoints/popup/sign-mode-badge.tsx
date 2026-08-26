import { SignMode } from "@/components/sign-mode-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isSignableWallet, SIGNER_MODE_LABELS, type WalletConfig } from "@/lib/config";

export function SignModeBadge({ wallet }: { wallet: WalletConfig }) {
  const warned = wallet.signer !== "watch-only" && !isSignableWallet(wallet);
  const mismatch =
    wallet.signer === "keystone-qr" && wallet.chain === "ethereum" && wallet.validated === false;
  return (
    <Tooltip>
      <TooltipTrigger>
        <SignMode
          signer={wallet.signer}
          signable={isSignableWallet(wallet)}
          iconOnly
          className={`shrink-0 ${mismatch ? "text-amber-500" : "text-muted-foreground"}`}
        />
      </TooltipTrigger>
      <TooltipContent>
        {mismatch
          ? "Address does not match derivation path and xpub"
          : warned
            ? "Watch-only — add a derivation path and extended public key (xpub) to enable signing"
            : SIGNER_MODE_LABELS[wallet.signer]}
      </TooltipContent>
    </Tooltip>
  );
}
