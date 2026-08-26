import { Button } from "@/components/ui/button";
import { cancelRequest } from "@/lib/actions";
import type { SignPendingRequest } from "@/lib/requestStore";

export function TrezorView({ request }: { request: SignPendingRequest }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Trezor signing for this wallet is not wired up yet. The request has been kept pending.
      </p>
      <Button variant="outline" className="w-full" onClick={() => cancelRequest(request.id)}>
        Cancel
      </Button>
    </div>
  );
}
