import browser from "webextension-polyfill";
import type { PendingRequest, RequestPatch } from "../lib/requests.ts";

const REQUESTS_KEY = "requests";

export async function getStoredRequests(): Promise<Record<string, PendingRequest>> {
  const { [REQUESTS_KEY]: data } = await browser.storage.local.get(REQUESTS_KEY);
  return (data ?? {}) as Record<string, PendingRequest>;
}

export async function storeRequest(request: PendingRequest): Promise<void> {
  const requests = await getStoredRequests();
  requests[request.id] = request;
  await browser.storage.local.set({ [REQUESTS_KEY]: requests });
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
