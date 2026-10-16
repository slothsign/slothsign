import { describe, expect, test } from "bun:test";
import { evmGasInfo, gasBlockedReason, gasReady } from "../src/lib/evm-gas.ts";
import type { EvmGasState, SignPendingRequest } from "../src/lib/requests.ts";

const ADDRESS = "0x1234567890123456789012345678901234567890";

function evmTx(tx: Record<string, unknown>, gas?: EvmGasState): SignPendingRequest {
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
    gas,
    signerRequest: {
      version: 1,
      chain: "ethereum",
      chainId: "0x1",
      address: ADDRESS,
      type: "transaction",
      payload: JSON.stringify({ from: ADDRESS, ...tx }),
    },
  };
}

describe("evmGasInfo", () => {
  test("is not applicable to non-transaction requests", () => {
    const request = evmTx({});
    const info = evmGasInfo({
      ...request,
      signerRequest: { ...request.signerRequest!, type: "message" },
    });
    expect(info.applicable).toBe(false);
    expect(gasReady(info)).toBe(true);
  });

  test("reports a dApp-supplied gas limit as ready and not estimated", () => {
    const info = evmGasInfo(evmTx({ gas: "0x5208" }, { source: "dapp" }));
    expect(info).toMatchObject({ applicable: true, value: "0x5208", estimated: false });
    expect(gasReady(info)).toBe(true);
  });

  test("reads the gasLimit alias", () => {
    const info = evmGasInfo(evmTx({ gasLimit: "0x5208" }, { source: "dapp" }));
    expect(info.value).toBe("0x5208");
    expect(gasReady(info)).toBe(true);
  });

  test("marks an estimated value as estimated", () => {
    const info = evmGasInfo(evmTx({ gas: "0x5208" }, { source: "estimated", fetching: false }));
    expect(info.estimated).toBe(true);
    expect(gasReady(info)).toBe(true);
  });

  test("blocks and reports progress while estimating", () => {
    const info = evmGasInfo(evmTx({}, { source: "estimated", fetching: true }));
    expect(info.value).toBeUndefined();
    expect(gasReady(info)).toBe(false);
    expect(gasBlockedReason(info)).toBe("Estimating gas…");
  });

  test("blocks and surfaces the failure once estimation errors", () => {
    const info = evmGasInfo(evmTx({}, { source: "estimated", error: "no RPC endpoint" }));
    expect(gasReady(info)).toBe(false);
    expect(gasBlockedReason(info)).toBe("Gas estimate failed: no RPC endpoint");
  });

  test("blocks a request with no gas and no state", () => {
    const info = evmGasInfo(evmTx({}));
    expect(gasReady(info)).toBe(false);
    expect(gasBlockedReason(info)).toBe("Gas limit unavailable");
  });
});
