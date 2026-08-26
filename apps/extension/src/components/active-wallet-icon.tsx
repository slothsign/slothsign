import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { Circle, CircleCheck } from "lucide-react";

export function ActiveWalletIcon({
  active,
  size = "icon-sm",
  onClick,
}: {
  active: boolean;
  size?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size as VariantProps<typeof buttonVariants>["size"]}
      onClick={onClick}
      className="shrink-0"
      aria-label={active ? "Active wallet" : "Set as active wallet"}
    >
      {active ? (
        <CircleCheck className="size-4 text-primary" />
      ) : (
        <Circle className="size-4 text-muted-foreground/40 transition-colors hover:text-foreground" />
      )}
    </Button>
  );
}
