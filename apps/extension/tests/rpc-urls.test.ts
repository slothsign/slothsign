import { beforeAll, describe, expect, mock, test } from "bun:test";

let validateRpcUrl: (url: string) => string | null;
let parseRpcUrls: (value: unknown) => Record<string, string>;
let getEvmRpcUrl: (
  chain: { rpcUrls: { default: { http: string[] } } },
  custom?: Record<string, string>,
) => string | undefined;
let chainIdToHex: (id: number) => string;

beforeAll(async () => {
  mock.module("webextension-polyfill", () => ({
    default: {},
  }));
  const config = await import("../src/lib/config.ts");
  validateRpcUrl = config.validateRpcUrl;
  parseRpcUrls = config.parseRpcUrls;

  const evm = await import("../src/lib/evmChains.ts");
  getEvmRpcUrl = evm.getEvmRpcUrl;
  chainIdToHex = evm.chainIdToHex;
});

const mainnet = {
  id: 1,
  rpcUrls: { default: { http: ["https://eth.llamarpc.com"] } },
} as { id: number; rpcUrls: { default: { http: string[] } } };

describe("validateRpcUrl", () => {
  test("empty string returns null", () => {
    expect(validateRpcUrl("")).toBeNull();
    expect(validateRpcUrl("  ")).toBeNull();
  });

  test("valid http URL returns null", () => {
    expect(validateRpcUrl("http://localhost:8545")).toBeNull();
    expect(validateRpcUrl("https://eth-mainnet.g.alchemy.com/v2/demo")).toBeNull();
  });

  test("invalid URL returns error message", () => {
    expect(validateRpcUrl("not-a-url")).toBe("Invalid RPC URL");
    expect(validateRpcUrl("ftp://rpc.example.com")).toBe("RPC URL must use http:// or https://");
  });
});

describe("parseRpcUrls", () => {
  test("parses a valid record", () => {
    expect(
      parseRpcUrls({ "0x1": "https://eth.example.com", solana: "https://sol.example.com" }),
    ).toEqual({
      "0x1": "https://eth.example.com",
      solana: "https://sol.example.com",
    });
  });

  test("tolerates null / undefined / non-object values", () => {
    expect(parseRpcUrls(null)).toEqual({});
    expect(parseRpcUrls(undefined)).toEqual({});
    expect(parseRpcUrls(123)).toEqual({});
    expect(parseRpcUrls("string")).toEqual({});
  });
});

describe("getEvmRpcUrl", () => {
  test("returns the default when no custom map is provided", () => {
    expect(getEvmRpcUrl(mainnet)).toBe("https://eth.llamarpc.com");
  });

  test("returns the default when the custom map is empty", () => {
    expect(getEvmRpcUrl(mainnet, {})).toBe("https://eth.llamarpc.com");
  });

  test("returns the custom URL when set for the chain", () => {
    const custom = { [chainIdToHex(1)]: "https://my-eth.node" };
    expect(getEvmRpcUrl(mainnet, custom)).toBe("https://my-eth.node");
  });

  test("returns the default when the custom URL is an empty string", () => {
    const custom = { [chainIdToHex(1)]: "" };
    expect(getEvmRpcUrl(mainnet, custom)).toBe("https://eth.llamarpc.com");
  });

  test("ignores custom URLs for other chains", () => {
    const custom = { "0x89": "https://polygon.example.com" };
    expect(getEvmRpcUrl(mainnet, custom)).toBe("https://eth.llamarpc.com");
  });
});
