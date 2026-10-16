import { describe, expect, test } from "bun:test";
import { toHex } from "viem";
import {
  evmGasInfo,
  formatGasFee,
  formatGasLimit,
  formatGasPrice,
  gasBlockedReason,
  gasReady,
  parseAmount,
} from "../src/lib/evm-gas.ts";
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

describe("parseAmount", () => {
  test("parses 0x-hex and ignores anything else", () => {
    expect(parseAmount("0x5208")).toBe(21000n);
    expect(parseAmount("21000")).toBeUndefined();
    expect(parseAmount("0xzz")).toBeUndefined();
    expect(parseAmount(undefined)).toBeUndefined();
  });
});

describe("formatGasLimit", () => {
  test("renders a hex gas limit as a plain decimal", () => {
    expect(formatGasLimit("0x5208")).toBe("21000");
  });

  test("falls back to the raw value when it is not hex", () => {
    expect(formatGasLimit("21000")).toBe("21000");
  });
});

describe("formatGasPrice", () => {
  test("renders the per-gas price in gwei", () => {
    expect(formatGasPrice({ maxFeePerGas: toHex(24_000_000_000n) })).toBe("24 gwei");
  });

  test("falls back to gasPrice and returns undefined when absent", () => {
    expect(formatGasPrice({ gasPrice: toHex(24_000_000_000n) })).toBe("24 gwei");
    expect(formatGasPrice({})).toBeUndefined();
  });
});

describe("formatGasFee", () => {
  const eth = { symbol: "ETH", decimals: 18 };
  const gas = toHex(21_000n);
  const price = toHex(24_000_000_000n);

  test("multiplies the gas limit by the price into the native currency", () => {
    // 21,000 gas × 24 gwei = 0.000504 ETH
    expect(formatGasFee({ gas, maxFeePerGas: price }, eth)).toBe("0.000504 ETH");
  });

  test("accepts a legacy gasPrice", () => {
    expect(formatGasFee({ gas, gasPrice: price }, eth)).toBe("0.000504 ETH");
  });

  test("uses the chain's native decimals and symbol", () => {
    expect(formatGasFee({ gas, gasPrice: price }, { symbol: "X", decimals: 6 })).toBe(
      "504000000 X",
    );
  });

  test("returns undefined until both gas and price are known", () => {
    expect(formatGasFee({ maxFeePerGas: price }, eth)).toBeUndefined();
    expect(formatGasFee({ gas }, eth)).toBeUndefined();
  });
});
