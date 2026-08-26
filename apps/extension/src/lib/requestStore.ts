import browser from "webextension-polyfill";
import type { Chain, SignerRequest } from "@slothsign/core";
import type { SignerMode } from "./config.ts";

export type RequestStatus = "pending" | "resolved" | "rejected" | "cancelled";

interface PendingRequestBase {
  id: string;
  chain: Chain;
  origin: string;
  status: RequestStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  expiresAt: number;
}

export interface SignPendingRequest extends PendingRequestBase {
  kind: "sign";
  address: string;
  method: string;
  params: unknown[];
  signer: SignerMode;
  signerRequest?: SignerRequest;
  /** sloth://req/… transport string (offline mode) */
  transport?: string;
}

export interface ConnectPendingRequest extends PendingRequestBase {
  kind: "connect";
  method: string;
  accounts: string[];
}

export type PendingRequest = SignPendingRequest | ConnectPendingRequest;

export const REQUEST_TTL_MS = 15 * 60 * 1000;

const REQUESTS_KEY = "requests";

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getStoredRequests(): Promise<Record<string, PendingRequest>> {
  const { [REQUESTS_KEY]: data } = await browser.storage.local.get(REQUESTS_KEY);
  return (data ?? {}) as Record<string, PendingRequest>;
}

export async function storeRequest(request: PendingRequest): Promise<void> {
  const requests = await getStoredRequests();
  requests[request.id] = request;
  await browser.storage.local.set({ [REQUESTS_KEY]: requests });
}

export interface RequestPatch {
  status?: RequestStatus;
  result?: unknown;
  error?: string;
}

export async function updateRequest(id: string, patch: RequestPatch): Promise<void> {
  const requests = await getStoredRequests();
  const current = requests[id];
  if (!current) return;
  requests[id] = { ...current, ...patch } as PendingRequest;
  await browser.storage.local.set({ [REQUESTS_KEY]: requests });
}

export async function deleteRequest(id: string): Promise<void> {
  const requests = await getStoredRequests();
  delete requests[id];
  await browser.storage.local.set({ [REQUESTS_KEY]: requests });
}

export async function getRequest(id: string): Promise<PendingRequest | undefined> {
  const requests = await getStoredRequests();
  return requests[id];
}

export async function latestPendingRequest(): Promise<PendingRequest | undefined> {
  const requests = await getStoredRequests();
  return Object.values(requests)
    .filter((r) => r.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function listPendingRequests(): Promise<PendingRequest[]> {
  const requests = await getStoredRequests();
  return Object.values(requests)
    .filter((r) => r.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}
