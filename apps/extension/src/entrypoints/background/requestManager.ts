import { encodeRequest, type SignerRequest } from "@slothsign/core";
import browser from "webextension-polyfill";
import { markOriginConnected, readStoredWallets, walletForAddress } from "../../lib/config.ts";
import { extractOrigin, isAllowedPage } from "../../lib/origin.ts";
import { openRequestWindow } from "../../lib/popup.ts";
import { log } from "../../lib/log.ts";
import {
  deleteRequest,
  getRequest,
  latestPendingRequest,
  listPendingRequests,
  newRequestId,
  REQUEST_TTL_MS,
  storeRequest,
  updateRequest,
  type PendingRequest,
} from "../../lib/requestStore.ts";
import { buildSignerRequest, resolveAddress } from "./signers.ts";
import {
  clearSignerWindow,
  clearSignerWindowForRequest,
  getSignerWindow,
} from "../../lib/signerWindows.ts";

/**
 * Whether a signer popup is currently open. The stored entry is only ever an
 * id hint: liveness is verified on every check via windows.get (needs no
 * special permission, unlike tab URLs), so a dead entry can never wedge or
 * duplicate the queue.
 */
async function liveSignerWindowExists(): Promise<boolean> {
  const entry = await getSignerWindow();
  if (!entry) return false;
  try {
    await browser.windows.get(entry.windowId);
    return true;
  } catch {
    log?.warn("clearing stale signer window entry");
    await clearSignerWindow();
    return false;
  }
}

interface ActiveSigner {
  port: browser.Runtime.Port;
  requestId: string | undefined;
}

/**
 * The currently connected signer page, if any. Ports give exact liveness
 * within a service-worker lifetime: disconnects are observed reliably, so a
 * second concurrent connection is always a genuine duplicate.
 */
let activeSigner: ActiveSigner | null = null;

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "signer") return;
  port.onMessage.addListener((raw: unknown) => {
    void handleSignerHello(port, raw);
  });
  port.onDisconnect.addListener(() => {
    if (activeSigner?.port === port) {
      log?.debug("signer window disconnected");
      activeSigner = null;
      void showNextRequest();
    }
  });
});

async function handleSignerHello(port: browser.Runtime.Port, raw: unknown): Promise<void> {
  const data = raw as { type?: unknown; id?: unknown };
  if (data?.type !== "signer-hello") return;
  const id = typeof data.id === "string" ? data.id : undefined;
  const current = activeSigner;
  if (current && current.port !== port) {
    if (current.requestId !== undefined && current.requestId === id) {
      activeSigner = { port, requestId: id }; // same request, reloaded page
      return;
    }
    if (id !== undefined && current.requestId !== undefined) {
      const currentRequest = await getRequest(current.requestId);
      if (!currentRequest || currentRequest.status !== "pending") {
        // Previous window is finishing its close; hand over to the newcomer.
        log?.debug("signer window handed over");
        activeSigner = { port, requestId: id };
        return;
      }
    }
    log?.warn("duplicate signer window, closing it");
    try {
      port.postMessage({ type: "duplicate-signer" });
    } catch {
      // Page already gone.
    }
    return;
  }
  if (!current) activeSigner = { port, requestId: id };
}

interface Resolver {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

const resolvers = new Map<string, Resolver>();

/**
 * Show a window for the next pending request. Only one window is shown at a
 * time: if a request is already being reviewed, new requests wait until it is
 * approved or cancelled. Serialized so concurrent calls can't open duplicates.
 */
let showLock: Promise<void> = Promise.resolve();

export function showNextRequest(): Promise<void> {
  const run = showLock.then(async () => {
    if (activeSigner) {
      log?.debug("signer window already connected, new request waits");
      return;
    }
    if (await liveSignerWindowExists()) {
      log?.debug("signer window already open, new request waits");
      return;
    }
    // Never surface dead backlog as popups: expired requests are rejected
    // instead of shown, so cancelling through a stuck queue terminates.
    const now = Date.now();
    const fresh = (await listPendingRequests()).filter((r) => {
      if (r.expiresAt <= now) {
        log?.debug(`dropping expired request ${r.id}`);
        rejectRequest(r.id, "SlothSign: request timed out");
        return false;
      }
      return true;
    });
    const next = fresh[0];
    if (!next) return;
    log?.debug(`opening signer window for request ${next.id}`);
    await openRequestWindow(next.id);
  });
  showLock = run.catch(() => undefined);
  return run;
}

export interface CreatePendingInput {
  chain: "ethereum" | "solana";
  method: string;
  params: unknown[];
  originUrl: string | undefined;
  chainId: string;
}

/**
 * Create a pending request and dispatch to the wallet's signer mode.
 * Returns the pending request or throws a user-facing error.
 */
export async function createPendingRequest(input: CreatePendingInput): Promise<PendingRequest> {
  if (!isAllowedPage(input.originUrl)) {
    throw new Error("SlothSign: requests are only accepted from http(s) pages");
  }
  const origin = extractOrigin(input.originUrl);
  const address = resolveAddress(input.chain, input.method, input.params);
  if (!address) throw new Error(`SlothSign: could not resolve signing address for ${input.method}`);

  const wallets = await readStoredWallets();
  const wallet = walletForAddress(wallets, {
    chain: input.chain,
    address,
  });
  if (!wallet) {
    throw new Error(`SlothSign: no wallet configured for ${address}`);
  }

  const signerRequest: SignerRequest = buildSignerRequest(
    input.chain,
    input.method,
    input.params,
    input.chainId,
  );
  const now = Date.now();
  const request: PendingRequest = {
    id: newRequestId(),
    kind: "sign",
    chain: input.chain,
    method: input.method,
    params: input.params,
    origin,
    address,
    signer: wallet.signer,
    signerRequest,
    transport:
      wallet.signer === "keystone-qr" || wallet.signer === "address-qr"
        ? encodeRequest(signerRequest)
        : undefined,
    status: "pending",
    createdAt: now,
    expiresAt: now + REQUEST_TTL_MS,
  };
  await storeRequest(request);
  void showNextRequest();
  scheduleTimeout(request.id);
  return request;
}

/**
 * Create a pending connect approval request.
 * The origin is only marked connected once the user confirms.
 */
export async function createConnectRequest(input: {
  chain: "ethereum" | "solana";
  originUrl: string | undefined;
  accounts: string[];
}): Promise<PendingRequest> {
  if (!isAllowedPage(input.originUrl)) {
    throw new Error("SlothSign: requests are only accepted from http(s) pages");
  }
  const origin = extractOrigin(input.originUrl);
  const now = Date.now();
  const request: PendingRequest = {
    id: newRequestId(),
    kind: "connect",
    chain: input.chain,
    method: input.chain === "ethereum" ? "eth_requestAccounts" : "connect",
    origin,
    accounts: input.accounts,
    status: "pending",
    createdAt: now,
    expiresAt: now + REQUEST_TTL_MS,
  };
  await storeRequest(request);
  log?.debug(`connect request ${request.id} stored for ${origin}`);
  void showNextRequest();
  scheduleTimeout(request.id);
  return request;
}

/**
 * Approve a pending connect request: mark the origin connected and resolve
 * the dApp request with the exposed accounts.
 */
export async function confirmConnectRequest(id: string): Promise<void> {
  const request = await getRequest(id);
  if (!request || request.kind !== "connect") {
    throw new Error("SlothSign: connect request not found");
  }
  await markOriginConnected(request.chain, request.origin);
  resolveRequest(id, request.accounts);
}

/**
 * Register a resolver for an id. Called by the message handler.
 */
export function awaitResolution(id: string): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    resolvers.set(id, { resolve, reject });
  });
}

export function resolveRequest(id: string, result: unknown): void {
  const resolver = resolvers.get(id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  void updateRequest(id, { status: "resolved", result });
  resolver?.resolve(result);
  cleanup(id);
  void clearSignerWindowForRequest(id).then(() => showNextRequest());
}

export function rejectRequest(id: string, message: string): void {
  const resolver = resolvers.get(id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  void updateRequest(id, { status: "rejected", error: message });
  resolver?.reject(new Error(message));
  cleanup(id);
  void clearSignerWindowForRequest(id).then(() => showNextRequest());
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleTimeout(id: string): void {
  timers.set(
    id,
    setTimeout(() => {
      log?.warn(`request ${id} timed out`);
      rejectRequest(id, "SlothSign: request timed out");
    }, REQUEST_TTL_MS),
  );
}

function cleanup(id: string): void {
  setTimeout(() => {
    void deleteRequest(id);
  }, 30_000);
}

export { getRequest, latestPendingRequest, listPendingRequests };
