import { beforeEach, describe, expect, mock, test } from "bun:test";
import { decodeRequest } from "@slothsign/core";
import type { SignPendingRequest } from "../src/lib/requests.ts";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const TO = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";

// `lib/log.ts` reads this build-time define (see vite.config.ts); provide it so
// importing the background gas module doesn't throw under bun test.
Object.assign(globalThis, { __SLOTHSIGN_DEBUG__: false });

const store: Record<string, unknown> = {};

mock.module("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
        remove: async (key: string) => {
          delete store[key];
        },
      },
    },
  },
}));

const { storeRequest, getRequest } = await import("../src/webext/request-store.ts");
const { refreshEvmGas } = await import("../src/webext/evm-gas.ts");

function pendingRequest(patch: Partial<SignPendingRequest> = {}): SignPendingRequest {
  return {
    id: "req_1",
    kind: "sign",
    chain: "ethereum",
    method: "eth_sendTransaction",
    params: [],
    origin: "https://app.example",
    address: ADDRESS,
    signer: "trezor",
    status: "pending",
    createdAt: 0,
    expiresAt: 0,
    gas: { source: "estimated", fetching: true },
    signerRequest: {
      version: 1,
      chain: "ethereum",
      chainId: "0x1",
      address: ADDRESS,
      type: "transaction",
      payload: JSON.stringify({
        from: ADDRESS,
        to: TO,
        value: "0x0",
        nonce: "0x0",
        maxFeePerGas: "0x1",
        maxPriorityFeePerGas: "0x1",
      }),
    },
    ...patch,
  };
}

async function storedRequest(id = "req_1") {
  const request = await getRequest(id);
  return request?.kind === "sign" ? request : undefined;
}

function storedPayload(request: { signerRequest?: { payload: string } } | undefined) {
  return JSON.parse(request?.signerRequest?.payload ?? "{}") as Record<string, unknown>;
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

describe("refreshEvmGas", () => {
  test("stores the estimated gas and clears the fetching flag", async () => {
    await storeRequest(pendingRequest());
    const result = await refreshEvmGas("req_1", async () => "0x5208");
    expect(result.ok).toBe(true);
    const request = await storedRequest();
    expect(request?.gas).toEqual({ source: "estimated", fetching: false });
    expect(storedPayload(request).gas).toBe("0x5208");
  });

  test("surfaces a failure and leaves the payload without gas", async () => {
    await storeRequest(pendingRequest());
    const result = await refreshEvmGas("req_1", async () => {
      throw new Error("no RPC endpoint for this chain");
    });
    expect(result).toEqual({ ok: false, error: "no RPC endpoint for this chain" });
    const request = await storedRequest();
    expect(request?.gas).toEqual({
      source: "estimated",
      fetching: false,
      error: "no RPC endpoint for this chain",
    });
    expect(storedPayload(request).gas).toBeUndefined();
  });

  test("refreshes the QR transport for QR signers", async () => {
    await storeRequest(pendingRequest({ signer: "keystone-qr", transport: "sloth://req/stale" }));
    await refreshEvmGas("req_1", async () => "0x5208");
    const request = await storedRequest();
    expect(request?.transport).not.toBe("sloth://req/stale");
    expect(request?.transport?.startsWith("sloth://req/")).toBe(true);
    const transport = request?.transport ?? "";
    expect(JSON.parse(decodeRequest(transport).payload).gas).toBe("0x5208");
  });

  test("does not set a transport for non-QR signers", async () => {
    await storeRequest(pendingRequest());
    await refreshEvmGas("req_1", async () => "0x5208");
    expect((await storedRequest())?.transport).toBeUndefined();
  });

  test("ignores a request that is no longer pending", async () => {
    await storeRequest(pendingRequest({ status: "resolved" }));
    const result = await refreshEvmGas("req_1", async () => "0x5208");
    expect(result.ok).toBe(true);
    expect(storedPayload(await storedRequest()).gas).toBeUndefined();
  });

  test("rejects an unknown request", async () => {
    expect(await refreshEvmGas("missing")).toEqual({ ok: false, error: "Request not found" });
  });

  test("rejects a non-transaction request", async () => {
    const request = pendingRequest();
    const signerRequest = request.signerRequest;
    if (signerRequest) request.signerRequest = { ...signerRequest, type: "message" };
    await storeRequest(request);
    expect(await refreshEvmGas("req_1")).toEqual({
      ok: false,
      error: "Not an EVM transaction request",
    });
  });
});
