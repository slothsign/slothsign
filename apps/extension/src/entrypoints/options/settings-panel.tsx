import { EditableText } from "@/components/editable-text";
import { SOLANA_RPC_KEY, validateRpcUrl } from "@/lib/config";
import { chainIdToHex, EVM_CHAINS } from "@/lib/evmChains";
import { CheckIcon, Plus, Trash2Icon, XIcon } from "lucide-react";
import React, { Fragment, useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { ConfirmRemoveButton } from "./confirm-remove-button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import { useSettingsStore } from "./settings-store.ts";

interface RpcChain {
  key: string;
  name: string;
  badge?: string;
}

const RPC_CHAINS: RpcChain[] = [
  { key: SOLANA_RPC_KEY, name: "Solana" },
  ...EVM_CHAINS.map((c) => ({
    key: chainIdToHex(c.id),
    name: c.name,
    badge: chainIdToHex(c.id),
  })),
].sort((a, b) => a.name.localeCompare(b.name));

function AddChainForm({ available, onDone }: { available: RpcChain[]; onDone: () => void }) {
  const setRpcUrl = useSettingsStore((s) => s.setRpcUrl);
  const [selected, setSelected] = useState<string>(() => available[0]?.key ?? "");
  const [draft, setDraft] = useState("");
  const error = validateRpcUrl(draft);

  useEffect(() => {
    if (!available.some((c) => c.key === selected)) {
      setSelected(available[0]?.key ?? "");
    }
  }, [available, selected]);

  function handleAdd(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = draft.trim();
    if (!selected || error !== null || !url) return;
    void setRpcUrl(selected, url);
    setDraft("");
    onDone();
  }

  if (available.length === 0) return null;

  return (
    <form className="contents" onSubmit={handleAdd}>
      <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {(value) => available.find((c) => c.key === value)?.name ?? "Select chain"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {available.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <Input
            value={draft}
            placeholder="Custom RPC endpoint"
            required
            aria-invalid={error !== null}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 text-xs"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-xs"
            aria-label="Add"
            title="Add"
            className="text-muted-foreground"
            onMouseDown={(e) => e.preventDefault()}
          >
            <CheckIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Cancel"
            title="Cancel"
            className="text-muted-foreground"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDone}
          >
            <XIcon />
          </Button>
        </div>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const rpcUrls = useSettingsStore((s) => s.rpcUrls);
  const setRpcUrl = useSettingsStore((s) => s.setRpcUrl);
  const [adding, setAdding] = useState(false);

  const configured = RPC_CHAINS.filter((c) => rpcUrls[c.key]);
  const available = RPC_CHAINS.filter((c) => !rpcUrls[c.key]);

  return (
    <div className="space-y-6 p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Settings</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close settings"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          RPC endpoints are used for transaction pre-fill, passthrough requests and broadcasts.
          Leave a field empty to use the default endpoint.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          RPC endpoints
        </h3>

        <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
          {configured.map((entry) => (
            <Fragment key={entry.key}>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                {entry.name}
                {entry.badge ? <Badge variant="secondary">{entry.badge}</Badge> : null}
              </span>
              <EditableText
                value={rpcUrls[entry.key] ?? ""}
                className="text-xs"
                inputClassName="text-xs"
                placeholder="Custom RPC endpoint"
                onSave={(url) => {
                  const error = validateRpcUrl(url);
                  if (error) return error;
                  void setRpcUrl(entry.key, url);
                }}
                buttons={(defaults) => [
                  ...defaults,
                  <ConfirmRemoveButton
                    key="delete"
                    title="Remove RPC endpoint?"
                    description="This chain will fall back to its default RPC endpoint."
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove RPC endpoint"
                        title="Remove RPC endpoint"
                        className="text-muted-foreground"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Trash2Icon />
                      </Button>
                    }
                    onConfirm={() => void setRpcUrl(entry.key, "")}
                  />,
                ]}
              />
            </Fragment>
          ))}
          {adding ? <AddChainForm available={available} onDone={() => setAdding(false)} /> : null}
          {!adding ? (
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 w-fit"
              onClick={() => setAdding(true)}
              disabled={available.length === 0}
            >
              <Plus className="size-4" />
              Add chain
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
