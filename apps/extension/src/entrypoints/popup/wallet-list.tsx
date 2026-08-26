import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setActiveWallet } from "@/lib/actions";
import type { ActiveWallets, WalletConfig } from "@/lib/config";
import { groupByXpub } from "@/lib/wallet-groups";
import type { Chain } from "@slothsign/core";
import { Power } from "lucide-react";
import { usePopupStore } from "./popup-store";
import { WalletItem } from "./wallet-item";

export function WalletList({
  chain,
  wallets,
  onChainChange,
  active,
  onActiveChange,
  connected,
  onDisconnect,
}: {
  chain: Chain;
  wallets: WalletConfig[];
  onChainChange: (chain: Chain) => void;
  active: ActiveWallets;
  onActiveChange: (active: ActiveWallets) => void;
  connected: Record<Chain, boolean>;
  onDisconnect: (chain: Chain) => void;
}) {
  const chainInfo = usePopupStore((s) => s.chainInfo);
  const activeId = active[chain];

  function select(wallet: WalletConfig) {
    void setActiveWallet(chain, wallet.id)
      .then(onActiveChange)
      .catch(() => undefined);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Tabs value={chain} onValueChange={(v) => onChainChange(v as Chain)} className="gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="ethereum" className="flex-1">
            EVM
            {connected.ethereum ? (
              <span className="ml-1 size-1.5 rounded-full bg-emerald-500" aria-label="Connected" />
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="solana" className="flex-1">
            Solana
            {connected.solana ? (
              <span className="ml-1 size-1.5 rounded-full bg-emerald-500" aria-label="Connected" />
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex h-6 items-center justify-between gap-2">
        {chain === "ethereum" && chainInfo.chainId ? (
          <Badge>
            {chainInfo.name} · {chainInfo.chainId}
          </Badge>
        ) : (
          <span />
        )}
        {connected[chain] ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-emerald-600">Connected</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={() => onDisconnect(chain)}
              aria-label="Disconnect"
            >
              <Power />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Not connected</span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wallets found.</p>
        ) : (
          groupByXpub(wallets).map((group, groupIndex) => (
            <div
              key={`${groupIndex}-${group[0]!.id}`}
              className="overflow-hidden rounded-md border border-border"
            >
              {group.map((w, i) => (
                <div
                  key={`${groupIndex}-${w.id}`}
                  className={`flex w-full items-center justify-between gap-1 py-1.5 transition-colors ${
                    i > 0 ? "border-t border-border" : ""
                  } ${w.id === activeId ? "bg-accent" : ""}`}
                >
                  <WalletItem wallet={w} isActive={w.id === activeId} select={select} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
