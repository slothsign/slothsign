import { useEffect, useMemo, useState } from "react";
import { evmAddressFromXpub } from "@slothsign/keystore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable-text";
import { validateDerivationPath, type WalletConfig } from "@/lib/config";
import { useOptionsStore } from "./options-store";
import { Trash2, Undo2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExistingDraft {
  wallet: WalletConfig;
  label: string;
  deleted: boolean;
}

interface NewRow {
  key: number;
  index: string;
  label: string;
}

function parseIndex(segment: string | undefined): number {
  const n = Number.parseInt(segment ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

function prefixOf(path: string | undefined): string {
  const segments = (path ?? "")
    .replace(/^[mM]\/?/, "")
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) return "m/";
  return `m/${segments.slice(0, -1).join("/")}/`;
}

function lastSegment(path: string | undefined): string {
  const segments = (path ?? "").split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export function DeriveGroupDialog({
  open,
  onClose,
  xpub,
}: {
  open: boolean;
  onClose: () => void;
  xpub: string;
}) {
  const wallets = useOptionsStore((s) => s.wallets);
  const renameWallet = useOptionsStore((s) => s.renameWallet);
  const removeWallet = useOptionsStore((s) => s.removeWallet);
  const deriveAddWallet = useOptionsStore((s) => s.deriveAddWallet);

  const [existing, setExisting] = useState<ExistingDraft[]>([]);
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>();

  const group = useMemo(
    () =>
      wallets.filter(
        (w) => w.chain === "ethereum" && w.signer === "keystone-qr" && w.xpub === xpub,
      ),
    [wallets, xpub],
  );

  useEffect(() => {
    if (!open) return;
    setExisting(
      group.map((w) => ({
        wallet: w,
        label: w.label,
        deleted: false,
      })),
    );
    setNewRows([]);
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, xpub]);

  const firstLabel = existing[0]?.wallet.label || "Wallet";

  const prefix = useMemo(() => {
    const max = existing.reduce<ExistingDraft | undefined>((acc, d) => {
      if (d.deleted) return acc;
      if (!acc) return d;
      const a = parseIndex(lastSegment(d.wallet.path));
      return a > parseIndex(lastSegment(acc.wallet.path)) ? d : acc;
    }, undefined);
    return prefixOf(max?.wallet.path);
  }, [existing]);

  const nextIndex = useMemo(() => {
    let max = 0;
    for (const d of existing) {
      if (!d.deleted) max = Math.max(max, parseIndex(lastSegment(d.wallet.path)));
    }
    for (const r of newRows) {
      max = Math.max(max, parseIndex(r.index));
    }
    return max + 1;
  }, [existing, newRows]);

  function addRow() {
    setNewRows((rows) => [
      ...rows,
      { key: Date.now(), index: String(nextIndex), label: `${firstLabel} #${nextIndex}` },
    ]);
  }

  function updateRow(key: number, patch: Partial<NewRow>) {
    setNewRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setNewRows((rows) => rows.filter((r) => r.key !== key));
  }

  function toggleDelete(id: string) {
    setExisting((drafts) =>
      drafts.map((d) => (d.wallet.id === id ? { ...d, deleted: !d.deleted } : d)),
    );
  }

  function derivedAddress(index: string): { address: string; valid: boolean } {
    const path = `${prefix}${index}`;
    const message = validateDerivationPath(path);
    if (message) return { address: "", valid: false };
    try {
      return { address: evmAddressFromXpub(xpub, path), valid: true };
    } catch {
      return { address: "", valid: false };
    }
  }

  async function confirm() {
    setApplying(true);
    setError(undefined);
    try {
      const existingToDelete = existing.filter((d) => d.deleted);
      const existingToRename = existing.filter(
        (d) => !d.deleted && d.label.trim() !== d.wallet.label,
      );
      for (const d of existingToDelete) {
        await removeWallet(d.wallet.id);
      }
      for (const d of existingToRename) {
        await renameWallet(d.wallet.id, d.label);
      }
      for (const r of newRows) {
        const { address, valid } = derivedAddress(r.index);
        if (!valid) continue;
        const id = await deriveAddWallet(xpub, `${prefix}${r.index}`, address, r.label);
        if (!id) {
          setError(`Could not add wallet at ${prefix}${r.index} — address already exists`);
          return;
        }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Derive wallets</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          <div className="grid grid-cols-[10rem_1fr_20rem_auto] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
            <span>Path</span>
            <span>Label</span>
            <span>Address</span>
            <span />
          </div>

          {existing.map((d) => (
            <div
              key={d.wallet.id}
              className={cn(
                "grid grid-cols-[10rem_1fr_20rem_auto] items-center gap-2 rounded-md px-1 py-1",
                d.deleted && "opacity-50",
              )}
            >
              <span className={cn("font-mono text-xs", d.deleted && "line-through")}>
                {d.wallet.path}
              </span>
              <EditableText
                value={d.label}
                maxLength={40}
                placeholder="Label"
                wrap
                className="text-xs"
                inputClassName="h-6 w-full px-1.5 text-xs"
                onSave={(v) => {
                  setExisting((drafts) =>
                    drafts.map((x) => (x.wallet.id === d.wallet.id ? { ...x, label: v } : x)),
                  );
                }}
              />
              <span
                className={cn(
                  "font-mono text-xs break-all text-muted-foreground",
                  d.deleted && "line-through",
                )}
              >
                {d.wallet.address}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={d.deleted ? "text-destructive" : "text-muted-foreground"}
                aria-label={d.deleted ? "Undo delete" : "Delete"}
                title={d.deleted ? "Undo delete" : "Delete"}
                onClick={() => toggleDelete(d.wallet.id)}
              >
                {d.deleted ? <Undo2 /> : <Trash2 />}
              </Button>
            </div>
          ))}

          {newRows.map((r) => {
            const { address, valid } = derivedAddress(r.index);
            return (
              <div
                key={r.key}
                className="grid grid-cols-[10rem_1fr_20rem_auto] items-center gap-2 rounded-md border border-border px-1 py-1"
              >
                <div className="flex min-w-0 items-center gap-0.5">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{prefix}</span>
                  <Input
                    value={r.index}
                    onChange={(e) => updateRow(r.key, { index: e.target.value })}
                    inputMode="numeric"
                    className="h-6 min-w-0 flex-1 px-1 font-mono text-xs"
                  />
                </div>
                <Input
                  value={r.label}
                  maxLength={40}
                  onChange={(e) => updateRow(r.key, { label: e.target.value })}
                  className="h-6 w-full px-1.5 text-xs"
                />
                <span
                  className={cn(
                    "font-mono text-xs break-all",
                    valid ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  {valid ? address : "invalid"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Remove row"
                  title="Remove row"
                  onClick={() => removeRow(r.key)}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRow}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={applying}>
            {applying ? "Applying…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
