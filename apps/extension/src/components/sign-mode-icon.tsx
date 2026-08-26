import { Eye, FingerprintPattern, QrCode, TriangleAlert, Usb, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectValue } from "@/components/ui/select";
import { SIGNER_MODE_LABELS, type SignerMode } from "@/lib/config";

const SIGNER_ICONS: Record<SignerMode, LucideIcon> = {
  "watch-only": Eye,
  "keystone-qr": QrCode,
  trezor: Usb,
  "address-qr": FingerprintPattern,
};

function SignModeIcon({ signer }: { signer: SignerMode }) {
  const Icon = SIGNER_ICONS[signer];
  return <Icon className="size-4" />;
}

export function SignerSelectValue({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <SelectValue>
      {(value) => <SignMode signer={value as SignerMode} iconOnly={iconOnly} />}
    </SelectValue>
  );
}

export function SignMode({
  signer,
  iconOnly = false,
  signable = true,
  className,
}: {
  signer: SignerMode;
  iconOnly?: boolean;
  /** Whether the wallet can actually sign. Watch-only mode never warns. */
  signable?: boolean;
  className?: string;
}) {
  const warned = !signable && signer !== "watch-only";
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <SignModeIcon signer={signer} />
      {iconOnly ? null : SIGNER_MODE_LABELS[signer]}
      {warned ? (
        <TriangleAlert className="size-4 shrink-0 text-amber-500" aria-label="Not signable" />
      ) : null}
    </span>
  );
}
