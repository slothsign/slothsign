import { useEffect, useState, type FormEvent } from "react";
import { evmAddressFromXpub } from "@slothsign/keystore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ScanQrDialog } from "@/components/scan-qr-dialog";
import { SignMode, SignerSelectValue } from "@/components/sign-mode-icon";
import {
  SIGNER_MODE_DESCRIPTIONS,
  SIGNER_MODE_LABELS,
  validateDerivationPath,
  validateSolanaPath,
  validateXpub,
  type SignerMode,
} from "@/lib/config";
import { decodeAirGapKey, walletPathFromAirGap } from "@/lib/keystone";
import { useDebounce } from "@/lib/use-debounce";
import { useShallow } from "zustand/react/shallow";
import { GitBranch, RefreshCw, ScanLine } from "lucide-react";
import { useOptionsStore, validateField } from "./options-store";
import { VALIDATION_DEBOUNCE_MS } from "./constants";
import { DeriveGroupDialog } from "./derive-group-dialog";

export function AddWalletForm({ onDone }: { onDone: () => void }) {
  const {
    wallets,
    chain,
    address,
    signer,
    label,
    path,
    xpub,
    fieldErrors,
    setAddress,
    setSigner,
    setLabel,
    setPath,
    setXpub,
    setFieldError,
    addWallet,
  } = useOptionsStore(
    useShallow((s) => ({
      wallets: s.wallets,
      chain: s.chain,
      address: s.address,
      signer: s.signer,
      label: s.label,
      path: s.path,
      xpub: s.xpub,
      fieldErrors: s.fieldErrors,
      setAddress: s.setAddress,
      setSigner: s.setSigner,
      setLabel: s.setLabel,
      setPath: s.setPath,
      setXpub: s.setXpub,
      setFieldError: s.setFieldError,
      addWallet: s.addWallet,
    })),
  );

  const debouncedAddress = useDebounce(address, VALIDATION_DEBOUNCE_MS);

  useEffect(() => {
    if (!debouncedAddress.trim()) {
      setFieldError("address", "");
      return;
    }
    const message = validateField(wallets, chain, debouncedAddress);
    setFieldError("address", message ?? "");
  }, [debouncedAddress, chain, wallets, setFieldError]);

  const debouncedPath = useDebounce(path, VALIDATION_DEBOUNCE_MS);

  useEffect(() => {
    if (signer !== "keystone-qr") {
      setFieldError("path", "");
      return;
    }
    const message =
      chain === "ethereum"
        ? validateDerivationPath(debouncedPath)
        : validateSolanaPath(debouncedPath);
    setFieldError("path", message ?? "");
  }, [debouncedPath, chain, signer, setFieldError]);

  const debouncedXpub = useDebounce(xpub, VALIDATION_DEBOUNCE_MS);

  useEffect(() => {
    setFieldError("xpub", validateXpub(debouncedXpub) ?? "");
  }, [debouncedXpub, setFieldError]);

  const debouncedMismatch = useDebounce({ address, xpub, path }, VALIDATION_DEBOUNCE_MS);

  useEffect(() => {
    if (chain !== "ethereum" || signer !== "keystone-qr") {
      setFieldError("addressMismatch", "");
      return;
    }
    const { address: addr, xpub: key, path: p } = debouncedMismatch;
    if (
      !addr.trim() ||
      !key.trim() ||
      !p.trim() ||
      validateDerivationPath(p) !== null ||
      validateXpub(key) !== null
    ) {
      setFieldError("addressMismatch", "");
      return;
    }
    let message = "";
    try {
      const derived = evmAddressFromXpub(key.trim(), p.trim());
      if (derived.toLowerCase() !== addr.trim().toLowerCase()) {
        message = "Address does not match derivation path and xpub";
      }
    } catch {
      message = "";
    }
    setFieldError("addressMismatch", message);
  }, [debouncedMismatch, chain, signer, setFieldError]);

  function handleDerive() {
    if (validateDerivationPath(path) !== null || validateXpub(xpub) !== null) return;
    try {
      setAddress(evmAddressFromXpub(xpub.trim(), path.trim()));
    } catch {
      setFieldError("addressMismatch", "Could not derive address from path and xpub");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await addWallet();
    if (ok) onDone();
  }

  const [scanOpen, setScanOpen] = useState(false);
  const [deriveOpen, setDeriveOpen] = useState(false);
  const deriveEnabled =
    chain === "ethereum" &&
    signer === "keystone-qr" &&
    Boolean(xpub.trim() && path.trim()) &&
    validateDerivationPath(path) === null &&
    validateXpub(xpub) === null;

  function handleScan(data: string) {
    if (signer === "keystone-qr") {
      try {
        const { xpub, path, name } = decodeAirGapKey(data);
        const nextPath = walletPathFromAirGap(path);
        setXpub(xpub);
        setPath(nextPath);
        setAddress(evmAddressFromXpub(xpub, nextPath));
        if (name) setLabel(name);
        return;
      } catch {
        // Not an AirGap key — fall through to a plain address.
      }
    }
    setAddress(data.trim());
  }

  return (
    <>
      <form noValidate className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label>Signer mode</Label>
          <Select
            value={signer}
            onValueChange={(v) => setSigner(v as SignerMode)}
            items={SIGNER_MODE_LABELS}
          >
            <SelectTrigger>
              <SignerSelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SIGNER_MODE_LABELS).map(([value]) => (
                <SelectItem key={value} value={value}>
                  <SignMode signer={value as SignerMode} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{SIGNER_MODE_DESCRIPTIONS[signer]}</p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>
              Address
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Button
              type="button"
              variant="ghost"
              aria-label="Scan QR"
              title="Scan QR"
              className="h-auto gap-1 px-1 py-0.5 text-xs font-normal text-muted-foreground"
              onClick={() => setScanOpen(true)}
            >
              <ScanLine className="size-3.5" />
              {signer === "keystone-qr" ? "Scan AirGap QR or address" : "Scan address"}
            </Button>
          </div>
          <Input
            placeholder={chain === "ethereum" ? "0x…" : "Base58 pubkey…"}
            value={address}
            aria-invalid={Boolean(fieldErrors.address)}
            onChange={(e) => setAddress(e.target.value)}
          />
          {fieldErrors.address ? (
            <p className="text-xs text-destructive">{fieldErrors.address}</p>
          ) : null}
          {fieldErrors.addressMismatch ? (
            <p className="text-xs text-amber-500">{fieldErrors.addressMismatch}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Label</Label>
          <Input
            placeholder="My main wallet"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        {chain === "solana" && signer === "keystone-qr" ? (
          <div className="space-y-1.5">
            <Label>Derivation path</Label>
            <Input
              value={path}
              aria-invalid={Boolean(fieldErrors.path)}
              onChange={(e) => setPath(e.target.value)}
            />
            {fieldErrors.path ? (
              <p className="text-xs text-destructive">{fieldErrors.path}</p>
            ) : null}
          </div>
        ) : null}
        {chain === "ethereum" && signer === "keystone-qr" ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Derivation path</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Derive multiple wallets"
                    title="Derive multiple wallets"
                    className="h-auto gap-1 px-1 py-0.5 text-xs font-normal text-muted-foreground"
                    disabled={!deriveEnabled}
                    onClick={() => setDeriveOpen(true)}
                  >
                    <GitBranch className="size-3.5" />
                    Derive
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Recompute address from path and xpub"
                    title="Recompute address from path and xpub"
                    className="h-auto gap-1 px-1 py-0.5 text-xs font-normal text-muted-foreground"
                    disabled={!deriveEnabled}
                    onClick={handleDerive}
                  >
                    <RefreshCw className="size-3.5" />
                    Recompute address
                  </Button>
                </div>
              </div>
              <Input
                value={path}
                aria-invalid={Boolean(fieldErrors.path)}
                onChange={(e) => setPath(e.target.value)}
              />
              {fieldErrors.path ? (
                <p className="text-xs text-destructive">{fieldErrors.path}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Extended public key (xpub)</Label>
              <Input
                placeholder="xpub…"
                value={xpub}
                aria-invalid={Boolean(fieldErrors.xpub)}
                onChange={(e) => setXpub(e.target.value)}
              />
              {fieldErrors.xpub ? (
                <p className="text-xs text-destructive">{fieldErrors.xpub}</p>
              ) : null}
            </div>
          </>
        ) : null}
        <Button type="submit">Add wallet</Button>
      </form>
      <ScanQrDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScan} />
      {xpub ? (
        <DeriveGroupDialog
          open={deriveOpen}
          onClose={() => setDeriveOpen(false)}
          xpub={xpub.trim()}
        />
      ) : null}
    </>
  );
}
