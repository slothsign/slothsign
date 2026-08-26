import slothSvg from "@/assets/sloth.svg?raw";

// This code runs in the page's MAIN world and must be fully self-contained
// (crxjs builds it as a single IIFE: no code splitting, no dynamic import).
// We deliberately do NOT import the shared window/message schemas from
// @/lib here: they pull in zod (large) and, via config.ts, webextension-polyfill,
// which throws "This script should only be loaded in a browser extension."
// because chrome.runtime is unavailable in the MAIN world. So we inline the
// tiny window-channel helpers with duck-type guards instead of zod.

export const WINDOW_CHANNEL = "slothsign";

export const ICON = `data:image/svg+xml;base64,${btoa(slothSvg)}`;

export interface WindowRequest {
  channel: string;
  id: string;
  type:
    | "sign"
    | "accounts"
    | "connect"
    | "disconnect"
    | "chainId"
    | "switchChain"
    | "rpc"
    | "rpcConfig";
  chain: "ethereum" | "solana";
  method?: string;
  params?: unknown[];
}

export interface WindowResponse {
  channel: string;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export type NotificationType = "chainChanged" | "accountsChanged" | "disconnected";

export interface WindowNotification {
  channel: string;
  type: NotificationType;
  chain?: string;
  chainId?: string;
  accounts?: string[];
}

export function isWindowResponse(data: unknown): data is WindowResponse {
  if (typeof data !== "object" || data === null) return false;
  const value = data as Record<string, unknown>;
  return (
    value.channel === WINDOW_CHANNEL &&
    typeof value.id === "string" &&
    typeof value.ok === "boolean"
  );
}

export function isWindowNotification(data: unknown): data is WindowNotification {
  if (typeof data !== "object" || data === null) return false;
  const value = data as Record<string, unknown>;
  return (
    value.channel === WINDOW_CHANNEL &&
    (value.type === "chainChanged" ||
      value.type === "accountsChanged" ||
      value.type === "disconnected")
  );
}

export function postToBridge(request: WindowRequest): void {
  window.postMessage(request, "*");
}

export function bridgeRequest<T>(
  type:
    | "sign"
    | "accounts"
    | "connect"
    | "disconnect"
    | "chainId"
    | "switchChain"
    | "rpc"
    | "rpcConfig",
  chain: "ethereum" | "solana",
  method?: string,
  params?: unknown[],
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = crypto.randomUUID();
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!isWindowResponse(event.data)) return;
      if (event.data.id !== id) return;
      window.removeEventListener("message", handler);
      if (event.data.ok) resolve(event.data.result as T);
      else reject(bridgeError(event.data.error));
    };
    window.addEventListener("message", handler);
    postToBridge({ channel: WINDOW_CHANNEL, id, type, chain, method, params });
  });
}

function bridgeError(
  error: { code?: number; message?: string; data?: unknown } | undefined,
): Error {
  const err = new Error(error?.message ?? "SlothSign: request failed");
  if (error?.code != null) (err as { code?: number }).code = error.code;
  if (error?.data !== undefined) (err as { data?: unknown }).data = error.data;
  return err;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
