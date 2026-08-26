import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Trash2Icon } from "lucide-react";

export function ConfirmRemoveButton({
  title = "Remove wallet?",
  description = "This wallet will be removed from SlothSign.",
  trigger,
  onConfirm,
}: {
  title?: string;
  description?: string;
  trigger?: ReactElement;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          trigger ?? (
            <Button variant="destructive" size="icon-sm" aria-label="Remove wallet">
              <Trash2Icon />
            </Button>
          )
        }
      />
      <PopoverContent side="left" align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Remove
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
