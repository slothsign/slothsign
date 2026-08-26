import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";

export function CopyButton({
  value,
  children,
  ...props
}: { value: string } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="ghost" aria-label="Copy" {...props} onClick={() => void copy()}>
      {copied ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
      {children}
    </Button>
  );
}
