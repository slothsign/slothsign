import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CameraScanner } from "@/components/camera-scanner";
import { ScanLine } from "lucide-react";
import { decodeSignature } from "@/lib/keystone";

export function SignatureInput({
  value,
  onChange,
  onSubmit,
  error,
  chain,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error?: string;
  chain: "ethereum" | "solana";
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanError, setScanError] = useState<string>();

  function openDialog() {
    setScanError(undefined);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function handleScan(text: string) {
    try {
      onChange(String(decodeSignature(text, chain)));
      closeDialog();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="sig">Signature</Label>
          <Button
            type="button"
            variant="ghost"
            aria-label="Scan QR"
            title="Scan QR"
            className="h-auto gap-1 px-1 py-0.5 text-xs font-normal text-muted-foreground"
            onClick={openDialog}
          >
            <ScanLine className="size-3.5" />
            Scan QR
          </Button>
        </div>
        <Textarea
          id="sig"
          placeholder="Paste a signature or scan a UR"
          value={value}
          className="max-h-30 text-xs"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={!value.trim()}>
        Submit signature
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan signature</DialogTitle>
          </DialogHeader>
          <CameraScanner
            scanning={dialogOpen}
            onToggle={closeDialog}
            onScan={handleScan}
            onError={setScanError}
          />
          {scanError ? <p className="text-xs text-destructive">{scanError}</p> : null}
        </DialogContent>
      </Dialog>
    </form>
  );
}
