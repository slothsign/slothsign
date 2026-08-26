import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TriangleAlert } from "lucide-react";

export function DecodeError({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-destructive">
      <span>{reason ? "Unable to decode request" : "Unknown request"}</span>
      {reason ? (
        <Tooltip>
          <TooltipTrigger>
            <span className="cursor-pointer">
              <TriangleAlert className="size-4 shrink-0" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="max-w-xs break-all whitespace-pre-wrap">{reason}</div>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
