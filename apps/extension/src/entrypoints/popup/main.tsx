import "@/style.css";
import type { Chain } from "@slothsign/core";
import { SearchIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import { useShallow } from "zustand/react/shallow";
import slothSvg from "../../assets/sloth.svg";
import { Button } from "../../components/ui/button.tsx";
import { CopyButton } from "../../components/ui/copy-button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { TooltipProvider } from "../../components/ui/tooltip.tsx";
import { disconnect } from "../../lib/actions.ts";
import { readLastChainTab, writeLastChainTab } from "../../lib/config.ts";
import { shortAddress } from "../../lib/util.ts";
import { usePopupStore } from "./popup-store.ts";
import { WalletList } from "./wallet-list.tsx";

function App() {
  const [chain, setChain] = useState<Chain>("ethereum");
  const [query, setQuery] = useState("");
  const { wallets, active, connected, refresh } = usePopupStore(
    useShallow((s) => ({
      wallets: s.wallets,
      active: s.active,
      connected: s.connected,
      refresh: s.refresh,
    })),
  );

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    void readLastChainTab()
      .then(setChain)
      .catch(() => undefined);
  }, []);

  const setChainTab = (next: Chain) => {
    setChain(next);
    void writeLastChainTab(next).catch(() => undefined);
  };

  const q = query.trim().toLowerCase();
  const filteredWallets = wallets.filter(
    (w) =>
      w.chain === chain &&
      (!q || w.label.toLowerCase().includes(q) || w.address.toLowerCase().includes(q)),
  );

  const activeId = active[chain];
  const activeWallet = activeId
    ? wallets.find((w) => w.chain === chain && w.id === activeId)
    : undefined;
  const activeAddress = activeWallet?.address;

  return (
    <div className="flex h-150 min-w-100 flex-col gap-3 overflow-hidden p-4">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <img src={slothSvg} alt="" className="size-4 shrink-0" />
          <span className="truncate font-mono text-sm" title={activeAddress}>
            {activeAddress ? shortAddress(activeAddress) : ""}
          </span>
          {activeAddress ? <CopyButton size="icon-xs" value={activeAddress} /> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => browser.runtime.openOptionsPage()}>
          Manage wallets
        </Button>
      </div>

      <div className="relative shrink-0">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by label or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-6 pl-8 text-sm"
        />
      </div>

      <WalletList
        chain={chain}
        wallets={filteredWallets}
        onChainChange={setChainTab}
        active={active}
        onActiveChange={() => void refresh().then(() => undefined)}
        connected={connected}
        onDisconnect={(c) => {
          void disconnect(c)
            .then(refresh)
            .catch(() => undefined);
        }}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delay={0}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
