import { CameraScanner } from "@/components/camera-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckIcon, PencilIcon, ScanLine, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

export function EditableText({
  value,
  onSave,
  maxLength,
  multiline,
  placeholder = "Edit",
  emptyText = null,
  inputClassName,
  className,
  scan,
  wrap,
  readOnly = false,
  editButtons,
  buttons,
}: {
  value: string;
  onSave: (value: string) => string | void;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
  emptyText?: ReactNode;
  inputClassName?: string;
  className?: string;
  scan?: { decode: (text: string) => string };
  /** Wrap long values instead of truncating them (display mode). */
  wrap?: boolean;
  /** Verified values cannot be changed — no edit affordance is rendered. */
  readOnly?: boolean;
  /** Override the edit-mode action buttons. Each inner array is a row. */
  editButtons?: (defaultButtons: ReactNode[][]) => ReactNode[][];
  /** Override the read-mode action buttons. */
  buttons?: (defaultButtons: ReactNode[]) => ReactNode[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();

  function commit() {
    const message = onSave(draft.trim());
    if (message) {
      setSaveError(message);
      return;
    }
    setSaveError(undefined);
    setEditing(false);
  }

  function openDialog() {
    setScanError(undefined);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function handleScan(data: string) {
    if (!scan) return;
    try {
      setDraft(scan.decode(data));
      closeDialog();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    }
  }

  if (readOnly) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        {value ? (
          <span className={cn("min-w-0", wrap ? "break-all" : "truncate", className)}>{value}</span>
        ) : (
          <span className="text-muted-foreground italic">{emptyText}</span>
        )}
      </div>
    );
  }

  if (editing) {
    const shared = {
      value: draft,
      maxLength,
      placeholder,
      className: cn(inputClassName, "flex-1 min-w-0"),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") setEditing(false);
      },
    };
    const defaultButtons: ReactNode[][] = [
      ...(scan
        ? [
            [
              <Button
                key="scan"
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Scan QR"
                title="Scan QR"
                className="text-muted-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openDialog}
              >
                <ScanLine />
              </Button>,
            ],
          ]
        : []),
      [
        <Button
          key="save"
          type="submit"
          variant="ghost"
          size="icon-xs"
          aria-label="Save"
          title="Save"
          className="text-muted-foreground"
          onMouseDown={(e) => e.preventDefault()}
        >
          <CheckIcon />
        </Button>,
        <Button
          key="cancel"
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cancel"
          title="Cancel"
          className="text-muted-foreground"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(false)}
        >
          <XIcon />
        </Button>,
      ],
    ];
    const actionButtons = editButtons ? editButtons(defaultButtons) : defaultButtons;
    const form = (
      <div className="min-w-0 flex-1">
        <form
          className="flex min-w-0 items-end gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          {multiline ? <Textarea autoFocus {...shared} /> : <Input autoFocus {...shared} />}
          <div className="flex shrink-0 flex-col gap-1">
            {actionButtons.map((row, i) => (
              <div key={i} className="flex items-center gap-1">
                {row}
              </div>
            ))}
          </div>
        </form>
        {saveError ? <p className="mt-1 text-xs text-destructive">{saveError}</p> : null}
      </div>
    );
    return scan ? (
      <>
        {form}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scan QR</DialogTitle>
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
      </>
    ) : (
      form
    );
  }

  const defaultReadButtons: ReactNode[] = [
    <Button
      key="edit"
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Edit"
      title="Edit"
      className="text-muted-foreground"
      onClick={() => {
        setDraft(value);
        setSaveError(undefined);
        setEditing(true);
      }}
    >
      <PencilIcon />
    </Button>,
  ];
  const readActionButtons = buttons ? buttons(defaultReadButtons) : defaultReadButtons;

  return (
    <div className="flex min-w-0 items-center gap-1">
      {value ? (
        <span className={cn("min-w-0", wrap ? "break-all" : "truncate", className)}>{value}</span>
      ) : (
        <span className="text-muted-foreground italic">{emptyText}</span>
      )}
      <div className="flex shrink-0 items-center gap-1">{readActionButtons}</div>
    </div>
  );
}
