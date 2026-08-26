import "@/style.css";
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { useShallow } from "zustand/react/shallow";
import { RequestDetail } from "./request-detail.tsx";
import { useSignerStore } from "./signer-store.ts";
import { TooltipProvider } from "@/components/ui/tooltip";
import slothSvg from "../../assets/sloth.svg";

function App() {
  const { wallets, requests, loaded, refresh } = useSignerStore(
    useShallow((s) => ({
      wallets: s.wallets,
      requests: s.requests,
      loaded: s.loaded,
      refresh: s.refresh,
    })),
  );
  const params = new URLSearchParams(window.location.search);
  const initialId = params.get("id") ?? undefined;
  const targetIdRef = useRef<string | undefined>(initialId);
  const closingRef = useRef(false);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!loaded || targetIdRef.current) return;
    const first = requests[0];
    if (first) targetIdRef.current = first.id;
  }, [loaded, requests]);

  useEffect(() => {
    if (!loaded || closingRef.current) return;
    if (!targetIdRef.current) return;
    if (!requests.some((r) => r.id === targetIdRef.current)) {
      closingRef.current = true;
      window.close();
    }
  }, [loaded, requests]);

  const request = requests.find((r) => r.id === targetIdRef.current);

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      {request ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-background px-4 py-3">
            <img src={slothSvg} alt="" className="size-4 shrink-0" />
            <h1 className="truncate text-sm font-semibold">SlothSign · Request</h1>
          </div>
          <div className="px-4 py-4">
            <RequestDetail request={request} wallets={wallets} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delay={0}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
