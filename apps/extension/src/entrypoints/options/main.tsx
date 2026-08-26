import { setWallets } from "@/lib/actions";
import type { WalletConfig } from "@/lib/config";
import { csvToWallets, walletsToCsv } from "@/lib/wallet-csv";
import { groupByXpub } from "@/lib/wallet-groups";
import "@/style.css";
import type { Chain } from "@slothsign/core";
import { Download, EllipsisVertical, Plus, SearchIcon, Settings, Upload } from "lucide-react";
import React from "react";
import { flushSync } from "react-dom";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import slothSvg from "../../assets/sloth.svg";
import { Button } from "../../components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Separator } from "../../components/ui/separator.tsx";
import { Toaster } from "../../components/ui/sonner.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { TooltipProvider } from "../../components/ui/tooltip.tsx";
import { AddWalletForm } from "./add-wallet-form.tsx";
import { useOptionsStore } from "./options-store.ts";
import "./options.css";
import { SettingsPanel } from "./settings-panel.tsx";
import { useSettingsStore } from "./settings-store.ts";
import { WalletItem } from "./wallet-item.tsx";

function WalletList({
  chain,
  wallets,
  activeId,
  expanded,
  onToggle,
}: {
  chain: "ethereum" | "solana";
  wallets: WalletConfig[];
  activeId?: string;
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  const { removeWallet, renameWallet, changeSigner, updateWalletField, setActive } =
    useOptionsStore(
      useShallow((s) => ({
        removeWallet: s.removeWallet,
        renameWallet: s.renameWallet,
        changeSigner: s.changeSigner,
        updateWalletField: s.updateWalletField,
        setActive: s.setActive,
      })),
    );

  if (wallets.length === 0) {
    return <p className="text-sm text-muted-foreground">No wallets found.</p>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      {groupByXpub(wallets).map((group, groupIndex) => (
        <div key={group[0]!.id} className="overflow-hidden rounded-md border border-border">
          {group.map((w, i) => (
            <React.Fragment key={w.id}>
              {i > 0 ? <div className="border-t border-border" /> : null}
              <WalletItem
                key={`${groupIndex}-${i}`}
                wallet={w}
                active={w.id === activeId}
                expanded={expanded === w.id}
                onToggle={() => onToggle(w.id)}
                onSetActive={() => void setActive(chain, w.id)}
                onRename={(label) => void renameWallet(w.id, label)}
                onChangeSigner={(signer) => void changeSigner(w.id, signer)}
                onRemove={() => void removeWallet(w.id)}
                onUpdateField={(field, value) => void updateWalletField(w.id, field, value)}
              />
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { wallets, active, chain, loadWallets, setChain } = useOptionsStore(
    useShallow((s) => ({
      wallets: s.wallets,
      active: s.active,
      chain: s.chain,
      loadWallets: s.loadWallets,
      setChain: s.setChain,
    })),
  );
  const { settingsOpen, setSettingsOpen } = useSettingsStore(
    useShallow((s) => ({ settingsOpen: s.open, setSettingsOpen: s.setOpen })),
  );

  React.useEffect(() => {
    void loadWallets();
    void useSettingsStore.getState().load();
  }, [loadWallets]);

  const q = query.trim().toLowerCase();
  const chainWallets = wallets.filter(
    (w) =>
      w.chain === chain &&
      (!q || w.label.toLowerCase().includes(q) || w.address.toLowerCase().includes(q)),
  );

  function toggleSettings(next = !settingsOpen) {
    if (
      window.matchMedia("(min-width: 1024px)").matches &&
      typeof document.startViewTransition === "function"
    ) {
      document.startViewTransition(() => {
        flushSync(() => setSettingsOpen(next));
      });
    } else {
      setSettingsOpen(next);
    }
  }

  const fileRef = React.useRef<HTMLInputElement>(null);

  function handleExport() {
    const csv = walletsToCsv(wallets);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `slothsign-wallets-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${wallets.length} wallet${wallets.length === 1 ? "" : "s"}`);
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const { wallets: imported, errors } = csvToWallets(text, wallets);
    if (imported.length > 0) {
      await setWallets([...wallets, ...imported]);
      await loadWallets();
    }
    if (imported.length === 0) {
      toast.error("No wallets imported", { description: errors[0] });
    } else if (errors.length > 0) {
      toast.success(
        `Imported ${imported.length} wallet${imported.length === 1 ? "" : "s"}, skipped ${errors.length} row${errors.length === 1 ? "" : "s"}`,
        { description: errors[0] },
      );
    } else {
      toast.success(`Imported ${imported.length} wallet${imported.length === 1 ? "" : "s"}`);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleImportFile(file);
  }

  return (
    <div className="flex h-screen min-h-120 justify-center max-w-screen-xl mx-auto *:w-full *:min-w-130 *:md:w-1/2">
      <div
        className={`view-main flex-col gap-4 overflow-hidden p-4 shadow bg-background ${
          settingsOpen ? "hidden lg:flex border-r" : "flex"
        }`}
      >
        <div className="shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <img src={slothSvg} alt="" className="size-6" />
              SlothSign
            </h1>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label="Import or export wallets" />
                  }
                >
                  <EllipsisVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                    <Upload className="size-4" />
                    Import CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <Download className="size-4" />
                    Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle settings"
                aria-pressed={settingsOpen}
                onClick={() => toggleSettings()}
              >
                <Settings className="size-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Public wallet configuration only. No private keys are ever stored here.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by label or address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add wallet
          </Button>
        </div>

        <Tabs
          value={chain}
          onValueChange={(v) => setChain(v as Chain)}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="ethereum" className="flex-1">
              EVM
            </TabsTrigger>
            <TabsTrigger value="solana" className="flex-1">
              Solana
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ethereum" className="flex min-h-0 flex-1 flex-col">
            <WalletList
              chain="ethereum"
              wallets={chain === "ethereum" ? chainWallets : []}
              activeId={active.ethereum}
              expanded={expanded}
              onToggle={(id) => setExpanded(expanded === id ? null : id)}
            />
          </TabsContent>
          <TabsContent value="solana" className="flex min-h-0 flex-1 flex-col">
            <WalletList
              chain="solana"
              wallets={chain === "solana" ? chainWallets : []}
              activeId={active.solana}
              expanded={expanded}
              onToggle={(id) => setExpanded(expanded === id ? null : id)}
            />
          </TabsContent>
        </Tabs>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add {chain === "ethereum" ? "EVM" : "Solana"} wallet</DialogTitle>
            </DialogHeader>
            <AddWalletForm onDone={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>

        <Separator className="shrink-0" />

        <p className="shrink-0 text-xs text-muted-foreground">
          Wallet settings are public metadata and are only exposed to pages you visit for the
          configured chains.
        </p>
      </div>

      {settingsOpen ? (
        <aside className="view-settings flex w-full lg:w-1/2 flex-col overflow-y-auto bg-background shadow">
          <SettingsPanel onClose={() => toggleSettings(false)} />
        </aside>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delay={0}>
      <App />
      <Toaster />
    </TooltipProvider>
  </React.StrictMode>,
);
