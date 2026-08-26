import { ActiveWalletIcon } from "@/components/active-wallet-icon";
import { CopyButton } from "@/components/ui/copy-button";
import { validateDerivationPath, validateXpub, type WalletConfig } from "@/lib/config";
import { shortAddress } from "@/lib/util";
import { SignModeBadge } from "./sign-mode-badge";

export function WalletItem({
  wallet,
  isActive,
  select,
}: {
  wallet: WalletConfig;
  isActive: boolean;
  select: (wallet: WalletConfig) => void;
}) {
  const showPath =
    wallet.chain === "ethereum" &&
    wallet.signer === "keystone-qr" &&
    Boolean(wallet.xpub && wallet.path) &&
    validateXpub(wallet.xpub) === null &&
    validateDerivationPath(wallet.path) === null;
  return (
    <div className="flex w-full items-center justify-between gap-1 pr-1">
      <ActiveWalletIcon active={isActive} onClick={() => select(wallet)} />
      <button type="button" onClick={() => select(wallet)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium">
          {wallet.label || shortAddress(wallet.address)}
        </div>
        <div className="flex items-center gap-0.5 truncate">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {shortAddress(wallet.address)}
          </span>
          {showPath ? (
            <span className="ml-1.5 truncate font-mono text-xs text-muted-foreground">
              {wallet.path}
            </span>
          ) : null}
        </div>
      </button>
      <SignModeBadge wallet={wallet} />
      <CopyButton size="icon-xs" value={wallet.address} />
    </div>
  );
}
