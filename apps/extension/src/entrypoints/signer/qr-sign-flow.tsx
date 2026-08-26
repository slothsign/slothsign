import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/ui/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";
import { decodeResult, encodeResult, REQUEST_PREFIX, RESULT_PREFIX } from "@slothsign/core";
import { submitSignature } from "@/lib/actions";
import type { WalletConfig } from "@/lib/config";
import { buildRequestParts } from "@/lib/keystone";
import type { SignPendingRequest } from "@/lib/requestStore";
import { EvmIntentView } from "./evm-intent-view";
import { QrCodePanel } from "@/components/qr-code-panel";
import { SignatureInput } from "./signature-input";
import { SolanaIntentView } from "./solana-intent-view";

export function QrSignFlow({
  request,
  wallet,
}: {
  request: SignPendingRequest;
  wallet?: WalletConfig;
}) {
  const [dataTab, setDataTab] = useState("data");
  const [signature, setSignature] = useState("");
  const [error, setError] = useState<string>();

  const qr = useMemo(() => {
    try {
      const { parts, fallback } = buildRequestParts(request, wallet);
      return { parts, error: undefined as string | undefined, fallback };
    } catch (e) {
      return {
        parts: [] as string[],
        error: e instanceof Error ? e.message : String(e),
        fallback: "",
      };
    }
  }, [request, wallet]);

  const rawJson = useMemo(
    () => JSON.stringify(request.signerRequest, null, 2),
    [request.signerRequest],
  );

  const requestSegments = useMemo(() => {
    const text = qr.fallback || "";
    const suffix = text.includes(".") ? text.slice(text.lastIndexOf(".")) : "";
    const prefix = REQUEST_PREFIX + text.slice(REQUEST_PREFIX.length, REQUEST_PREFIX.length + 8);
    const middle = text.slice(prefix.length, text.length - suffix.length);
    return { prefix, middle, suffix };
  }, [qr.fallback]);

  async function submit() {
    try {
      const raw = signature.trim();
      let value = raw;
      if (raw.startsWith(RESULT_PREFIX)) {
        const decoded = decodeResult(raw);
        if (decoded.chain !== request.chain) {
          throw new Error(`Signature chain mismatch: expected ${request.chain}`);
        }
        value = String(decoded.result);
      }
      const payload = encodeResult({ chain: request.chain, result: value });
      const res = await submitSignature(request.id, payload);
      if (!res.ok) throw new Error(res.error ?? "SlothSign: failed to submit signature");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <section>
        {request.chain === "ethereum" ? (
          <EvmIntentView request={request} />
        ) : (
          <SolanaIntentView request={request} />
        )}
      </section>

      <Tabs
        value={dataTab}
        onValueChange={(value) => {
          setDataTab(value);
          if (value === "qr") setError(undefined);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="data">Sign data</TabsTrigger>
          <TabsTrigger value="qr">QR code</TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <div className="space-y-2">
            <div className="max-h-60 overflow-auto rounded-md border border-border p-2 font-mono text-xs leading-snug break-all whitespace-pre-wrap">
              <span className="text-primary">{requestSegments.prefix}</span>
              <span className="text-muted-foreground">{requestSegments.middle}</span>
              <span className="text-primary">{requestSegments.suffix}</span>
            </div>
            <div className="flex items-center justify-end gap-1">
              <CopyButton value={qr.fallback}>Copy request</CopyButton>
              <Tooltip>
                <TooltipTrigger>
                  <span className="cursor-pointer">
                    <CircleHelp className="size-4 text-muted-foreground hover:text-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div>
                    Paste the copied request into{" "}
                    <code className="font-mono">sloth sign &lt;request&gt;</code>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <details className="mt-2 rounded-md border border-border p-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Raw data
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-snug text-muted-foreground">
              {rawJson}
            </pre>
          </details>
        </TabsContent>
        <TabsContent value="qr">
          {qr.error ? (
            <p className="text-center text-xs text-destructive">{qr.error}</p>
          ) : (
            <QrCodePanel parts={qr.parts} />
          )}
        </TabsContent>
      </Tabs>

      <SignatureInput
        value={signature}
        onChange={setSignature}
        onSubmit={() => void submit()}
        error={error}
        chain={request.chain}
      />
    </div>
  );
}
