import { ActiveWalletIcon } from "@/components/active-wallet-icon";
import { EditableText } from "@/components/editable-text";
import { SignerSelectValue, SignMode } from "@/components/sign-mode-icon";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  isSignableWallet,
  SIGNER_MODE_LABELS,
  validateDerivationPath,
  validateXpub,
  type SignerMode,
  type WalletConfig,
} from "@/lib/config";
import { decodeXpub } from "@/lib/keystone";
import { trezorGetXpub } from "@/lib/actions";
import { shortAddress } from "@/lib/util";
import { cn } from "@/lib/utils";
import { ChevronDown, GitBranch, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ConfirmRemoveButton } from "./confirm-remove-button";
import { DeriveGroupDialog } from "./derive-group-dialog";

export function WalletItem({
  wallet,
  active,
  expanded,
  onToggle,
  onSetActive,
  onRename,
  onChangeSigner,
  onRemove,
  onUpdateField,
}: {
  wallet: WalletConfig;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSetActive: () => void;
  onRename: (label: string) => void;
  onChangeSigner: (signer: SignerMode) => void;
  onRemove: () => void;
  onUpdateField: (field: "path" | "xpub", value: string) => void;
}) {
  const isXpubSigner = wallet.signer === "keystone-qr" || wallet.signer === "trezor";
  const canExpand = wallet.chain === "ethereum" && isXpubSigner;
  const validated = wallet.validated;
  const pathInvalid = validateDerivationPath(wallet.path) !== null;
  const showWarning =
    wallet.chain === "ethereum" &&
    isXpubSigner &&
    (!isSignableWallet(wallet) || validated === false || pathInvalid);
  const warningMessage = !isSignableWallet(wallet)
    ? "Signing is not enabled — set a derivation path and xpub"
    : pathInvalid
      ? "Invalid derivation path — signing will fail"
      : "Address does not match derivation path and xpub";
  const showPathTag =
    canExpand &&
    Boolean(wallet.path) &&
    !pathInvalid &&
    (!wallet.xpub || validateXpub(wallet.xpub) === null);
  const [deriveOpen, setDeriveOpen] = useState(false);
  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-1 pr-2 py-1">
        <ActiveWalletIcon active={active} onClick={onSetActive} />
        <div className="flex items-center gap-2">
          <EditableText
            value={wallet.label}
            emptyText="No name"
            maxLength={40}
            placeholder="Label"
            className="truncate text-sm font-medium"
            inputClassName="h-6 w-40 px-1.5 text-sm"
            onSave={onRename}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 row-span-2">
          {showWarning ? (
            <Tooltip>
              <TooltipTrigger>
                <TriangleAlert className="size-4 text-amber-500" aria-label="Watch-only" />
              </TooltipTrigger>
              <TooltipContent>{warningMessage}</TooltipContent>
            </Tooltip>
          ) : null}
          <Select
            value={wallet.signer}
            onValueChange={(v) => onChangeSigner(v as SignerMode)}
            items={SIGNER_MODE_LABELS}
          >
            <SelectTrigger>
              <SignerSelectValue iconOnly />
            </SelectTrigger>
            <SelectContent className="min-w-48">
              {Object.entries(SIGNER_MODE_LABELS).map(([value]) => (
                <SelectItem key={value} value={value}>
                  <SignMode signer={value as SignerMode} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ConfirmRemoveButton onConfirm={onRemove} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse signing details" : "Expand signing details"}
          className={cn("text-muted-foreground", !canExpand && "invisible")}
          onClick={canExpand ? onToggle : undefined}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </Button>
        <div className="flex items-center gap-0.5">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {shortAddress(wallet.address)}
          </span>
          <CopyButton size="icon-xs" value={wallet.address} />
          {showPathTag ? (
            <span className="ml-2 truncate font-mono text-xs text-muted-foreground">
              {wallet.path}
            </span>
          ) : null}
        </div>
      </div>
      {canExpand && expanded ? (
        <XpubSigningDetails
          wallet={wallet}
          onUpdateField={onUpdateField}
          onOpenDerive={() => setDeriveOpen(true)}
        />
      ) : null}
      {wallet.xpub ? (
        <DeriveGroupDialog
          open={deriveOpen}
          onClose={() => setDeriveOpen(false)}
          xpub={wallet.xpub}
          signer={wallet.signer}
        />
      ) : null}
    </div>
  );
}

/**
 * Shared expanded panel for xpub-based signers (Keystone QR and Trezor):
 * derivation path plus extended public key, with identical logic for both.
 * A validated path+xpub binding locks editing; further changes go through
 * the Derive dialog. The only signer-derived bit is the capture icon in edit
 * mode (AirGap QR scan vs. Trezor device fetch), which occupies the same slot.
 */
function XpubSigningDetails({
  wallet,
  onUpdateField,
  onOpenDerive,
}: {
  wallet: WalletConfig;
  onUpdateField: (field: "path" | "xpub", value: string) => void;
  onOpenDerive: () => void;
}) {
  const readOnly = wallet.validated === true;
  const canDerive = Boolean(wallet.xpub) && validateXpub(wallet.xpub) === null;

  /** Fetch the parent-level xpub from the device to fill the xpub draft. */
  async function fetchXpub(): Promise<string> {
    const segments = (wallet.path ?? "")
      .replace(/^[mM]\/?/, "")
      .split("/")
      .filter(Boolean);
    if (segments.length < 2) throw new Error("Path is too short to fetch from the device");
    const res = await trezorGetXpub(`m/${segments.slice(0, -1).join("/")}`);
    if (!res.ok || !res.xpub) throw new Error(res.error ?? "Could not fetch xpub");
    const key = res.xpub.trim();
    if (validateXpub(key) !== null) throw new Error("Device returned an invalid xpub");
    return key;
  }

  return (
    <div className="ml-7 mr-2">
      <div className="border-t border-border" />
      <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3 py-2.5">
        <span className="py-1 text-xs text-muted-foreground">Derivation path</span>
        <div className="flex min-w-0 items-center gap-1 self-center">
          <EditableText
            value={wallet.path ?? ""}
            placeholder="m/44'/60'/0'/0/0"
            emptyText="m/44'/60'/0'/0/0"
            className="min-w-0 truncate font-mono text-xs"
            inputClassName="h-6 w-full px-1.5 font-mono text-xs"
            onSave={(v) => {
              const message = validateDerivationPath(v);
              if (message) return message;
              onUpdateField("path", v);
            }}
            readOnly={readOnly}
          />
          {canDerive ? (
            <Button
              type="button"
              variant="ghost"
              aria-label="Derive wallets"
              title="Derive wallets"
              className="ml-2 h-4 shrink-0 gap-1 px-1 text-xs font-normal text-muted-foreground"
              onClick={onOpenDerive}
            >
              <GitBranch className="size-3.5" />
              Derive
            </Button>
          ) : null}
        </div>
        <span className="py-1 text-xs text-muted-foreground">Extended public key (xpub)</span>
        <EditableText
          value={wallet.xpub ?? ""}
          multiline
          placeholder="xpub…"
          emptyText={<span className="text-muted-foreground">(xpub not set)</span>}
          className="min-w-0 font-mono text-xs self-center"
          inputClassName="w-full font-mono text-xs"
          onSave={(v) => onUpdateField("xpub", v)}
          scan={wallet.signer === "keystone-qr" ? { decode: decodeXpub } : undefined}
          fetch={
            wallet.signer === "trezor"
              ? { fetch: fetchXpub, label: "Fetch xpub from Trezor" }
              : undefined
          }
          wrap
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
