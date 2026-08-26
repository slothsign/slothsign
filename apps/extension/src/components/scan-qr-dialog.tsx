import { useEffect, useState } from "react";
import { CameraScanner } from "@/components/camera-scanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ScanQrDialog({
  open,
  onOpenChange,
  onScan,
  title = "Scan QR",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (data: string) => void;
  title?: string;
}) {
  const [scanError, setScanError] = useState<string>();

  useEffect(() => {
    if (open) setScanError(undefined);
  }, [open]);

  function handleScan(data: string) {
    try {
      onScan(data);
      onOpenChange(false);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <CameraScanner
          scanning={open}
          onToggle={() => onOpenChange(false)}
          onScan={handleScan}
          onError={setScanError}
        />
        {scanError ? <p className="text-xs text-destructive">{scanError}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
