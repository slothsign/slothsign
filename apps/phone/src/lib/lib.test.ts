import { describe, expect, test } from "bun:test";
import { UR, UREncoder } from "@ngraveio/bc-ur";
import { evmRequestToSignerRequest } from "@slothsign/chain-evm";
import { solanaRequestToSignerRequest } from "@slothsign/chain-solana";
import { encodeRequest } from "@slothsign/core";
import { DEFAULT_PATHS } from "@slothsign/signing";
import { encode } from "borc";
import {
  addToRegistry,
  applyWalletEdit,
  buildWallet,
  deriveAccounts,
  EMPTY_REGISTRY,
  findAccount,
  normalizeMnemonic,
  parseRegistry,
  pathsToDerive,
  removeFromRegistry,
  walletErrorMessage,
  WalletInputError,
} from "./registry.ts";
import { RequestScanner, type ScanProgress } from "./request-scanner.ts";
import { fullRequestText, reviewRequest } from "./review.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const draft = {
  kind: "mnemonic" as const,
  name: "Main",
  mnemonic: MNEMONIC,
  passphrase: "",
  paths: DEFAULT_PATHS.join("\n"),
};

function transaction(overrides: Record<string, string> = {}) {
  return evmRequestToSignerRequest(
    "eth_sendTransaction",
    [
      {
        from: ADDRESS,
        to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        value: "0x2386f26fc10000",
        gas: "0x5208",
        nonce: "0x7",
        maxFeePerGas: "0x4a817c800",
        maxPriorityFeePerGas: "0x3b9aca00",
        ...overrides,
      },
    ],
    "0x89",
  );
}

describe("buildWallet", () => {
  test("derives an account per path and keeps secrets out of the entry", () => {
    const { entry, secret } = buildWallet("id1", draft);
    expect(entry.accounts.map((a) => a.chain)).toEqual(["ethereum", "solana"]);
    expect(entry.accounts[0]?.address).toBe(ADDRESS);
    expect(JSON.stringify(entry)).not.toContain("junk");
    expect(secret.kind).toBe("mnemonic");
  });

  test("normalizes spacing and case in a typed phrase", () => {
    expect(normalizeMnemonic("  Test   TEST\ntest ")).toBe("test test test");
  });

  test("rejects a phrase with a bad checksum", () => {
    expect(() =>
      buildWallet("id1", { ...draft, mnemonic: Array(12).fill("test").join(" ") }),
    ).toThrow("isn't valid");
  });

  test("rejects unsupported paths and duplicates", () => {
    expect(() => buildWallet("id1", { ...draft, paths: "m/44'/0'/0'/0/0" })).toThrow("supported");
    expect(() =>
      buildWallet("id1", { ...draft, paths: `${DEFAULT_PATHS[0]}\n${DEFAULT_PATHS[0]}` }),
    ).toThrow("unique");
  });

  test("rejects malformed paths before any key is derived", () => {
    for (const paths of [
      "m/44'/60'/0'/0/0x",
      "m/44'/501'/0'/0'x",
      "m/44'/501'/0'/0",
      "m/44'/60'//0",
    ]) {
      expect(() => buildWallet("id1", { ...draft, paths })).toThrow("supported");
    }
  });

  test("requires a name", () => {
    expect(() => buildWallet("id1", { ...draft, name: "  " })).toThrow("name");
  });

  test("infers the chain of a private key", () => {
    const { entry } = buildWallet("id2", {
      kind: "privateKey",
      name: "Raw",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    });
    expect(entry.accounts).toEqual([{ chain: "ethereum", address: ADDRESS }]);
  });
});

describe("registry", () => {
  const { entry } = buildWallet("id1", draft);
  const registry = addToRegistry(EMPTY_REGISTRY, entry);

  test("finds an EVM account in any case", () => {
    const found = findAccount(registry, { chain: "ethereum", address: ADDRESS.toLowerCase() });
    expect(found?.account.path).toBe(DEFAULT_PATHS[0]);
  });

  test("does not match an address on another chain", () => {
    expect(findAccount(registry, { chain: "solana", address: ADDRESS })).toBeUndefined();
  });

  test("rejects a wallet whose address already exists", () => {
    expect(() => addToRegistry(registry, { ...entry, id: "id2" })).toThrow("already");
  });

  test("survives a storage round trip and removal", () => {
    expect(parseRegistry(JSON.stringify(registry))).toEqual(registry);
    expect(removeFromRegistry(registry, "id1").wallets).toEqual([]);
  });

  test("rejects corrupted storage", () => {
    expect(() => parseRegistry('{"version":2,"wallets":[]}')).toThrow();
  });
});

describe("editing a wallet", () => {
  const { secret, entry } = buildWallet("id1", draft);
  const registry = addToRegistry(EMPTY_REGISTRY, entry);
  const [evmPath, solanaPath] = DEFAULT_PATHS as [string, string];
  const newPath = "m/44'/60'/0'/0/1";

  test("renaming needs no key and keeps the accounts", () => {
    const edit = { name: "  Savings ", paths: DEFAULT_PATHS.join("\n") };
    expect(pathsToDerive(entry, edit)).toEqual([]);
    const [edited] = applyWalletEdit(registry, entry, edit, []).wallets;
    expect(edited?.name).toBe("Savings");
    expect(edited?.accounts).toEqual(entry.accounts);
  });

  test("removing a path needs no key", () => {
    const edit = { name: "Main", paths: solanaPath };
    expect(pathsToDerive(entry, edit)).toEqual([]);
    const [edited] = applyWalletEdit(registry, entry, edit, []).wallets;
    expect(edited?.accounts.map((a) => a.path)).toEqual([solanaPath]);
  });

  test("only a new path is derived, and the entered order is kept", () => {
    const edit = { name: "Main", paths: `${newPath}\n${evmPath}` };
    expect(pathsToDerive(entry, edit)).toEqual([newPath]);
    const derived = deriveAccounts(secret, [newPath]);
    const [edited] = applyWalletEdit(registry, entry, edit, derived).wallets;
    expect(edited?.accounts.map((a) => a.path)).toEqual([newPath, evmPath]);
    expect(edited?.accounts[1]?.address).toBe(ADDRESS);
  });

  test("validates before any key is needed", () => {
    expect(() => pathsToDerive(entry, { name: " ", paths: evmPath })).toThrow("name");
    expect(() => pathsToDerive(entry, { name: "Main", paths: " \n" })).toThrow("at least one");
    expect(() => pathsToDerive(entry, { name: "Main", paths: "m/1" })).toThrow("supported");
  });

  test("rejects a new address already held by another wallet", () => {
    const other = buildWallet("id2", { ...draft, paths: "m/44'/60'/0'/0/2" }).entry;
    const both = addToRegistry(registry, other);
    const edit = { name: "Main", paths: `${evmPath}\nm/44'/60'/0'/0/2` };
    expect(() => applyWalletEdit(both, entry, edit, other.accounts)).toThrow("already in");
  });

  test("keeps a wallet's position in the list", () => {
    const other = buildWallet("id2", { ...draft, paths: "m/44'/60'/0'/0/2" }).entry;
    const both = addToRegistry(registry, other);
    const edited = applyWalletEdit(both, entry, { name: "First" }, []);
    expect(edited.wallets.map((w) => w.id)).toEqual(["id1", "id2"]);
  });

  test("ignores paths on a private key wallet", () => {
    const raw = buildWallet("id3", {
      kind: "privateKey",
      name: "Raw",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    }).entry;
    const list = addToRegistry(EMPTY_REGISTRY, raw);
    const edit = { name: "Renamed", paths: newPath };
    expect(pathsToDerive(raw, edit)).toEqual([]);
    expect(applyWalletEdit(list, raw, edit, []).wallets[0]?.accounts).toEqual(raw.accounts);
  });

  test("only input errors reach the user verbatim", () => {
    expect(walletErrorMessage(new WalletInputError("Shown"), "Fallback")).toBe("Shown");
    expect(walletErrorMessage(new Error("Internal detail"), "Fallback")).toBe("Fallback");
  });
});

describe("RequestScanner", () => {
  const request = transaction({ data: `0x${"ab".repeat(1000)}` });
  const frames = new UREncoder(
    new UR(encode(encodeRequest(request)), "sloth-sign-request"),
    256,
  ).encodeWhole();

  test("assembles animated frames, ignoring repeats", () => {
    const scanner = new RequestScanner();
    let last: ScanProgress | undefined;
    for (const frame of frames) {
      expect(scanner.accept(frame.toUpperCase())).toBeDefined();
      last = frame === frames.at(-1) ? undefined : scanner.accept(frame);
      expect(last).toBeUndefined();
    }
  });

  test("returns the request when complete", () => {
    const scanner = new RequestScanner();
    const results = frames.map((frame) => scanner.accept(frame));
    expect(results.at(-1)).toEqual({ status: "complete", request });
  });

  test("accepts the plain transport string", () => {
    expect(new RequestScanner().accept(encodeRequest(request))).toEqual({
      status: "complete",
      request,
    });
  });

  test("rejects other QR codes", () => {
    expect(new RequestScanner().accept("https://example.com")?.status).toBe("error");
    expect(new RequestScanner().accept("ur:eth-sign-request/abc")?.status).toBe("error");
  });
});

describe("reviewRequest", () => {
  function value(review: ReturnType<typeof reviewRequest>, label: string) {
    return review.rows.find((row) => row.label === label)?.value;
  }

  test("shows EVM amounts and fees in readable units", () => {
    const review = reviewRequest(transaction());
    expect(value(review, "Network")).toBe("EVM chain 137");
    expect(value(review, "Amount")).toBe("0.01 native token");
    expect(value(review, "Max network fee")).toBe("0.00042 native token");
    expect(value(review, "Nonce")).toBe("7");
    expect(value(review, "Data (not decoded)")).toBeUndefined();
  });

  test("labels calldata as not decoded", () => {
    const review = reviewRequest(transaction({ data: "0xabcdef" }));
    expect(value(review, "Data (not decoded)")).toBe("0xabcdef");
  });

  test("opens the full request for typed data so the values are visible", () => {
    const typedData = {
      domain: { name: "USD Coin" },
      types: { Permit: [{ name: "spender", type: "address" }] },
      primaryType: "Permit",
      message: { spender: "0x7099" },
    };
    const request = evmRequestToSignerRequest(
      "eth_signTypedData_v4",
      [ADDRESS, JSON.stringify(typedData)],
      "0x1",
    );
    const review = reviewRequest(request);
    expect(review.showFullRequest).toBe(true);
    expect(fullRequestText(request)).toContain('"spender": "0x7099"');
  });

  test("warns when a payload can't be decoded", () => {
    const review = reviewRequest({ ...transaction(), payload: "not json" });
    expect(review.title).toBe("Unknown request");
    expect(review.warning).toBeDefined();
  });

  test("shows a Solana text message", () => {
    const request = solanaRequestToSignerRequest("signMessage", {
      message: new TextEncoder().encode("Sign in"),
      publicKey: "oeYf6KAJkLYhBuR8CiGc6L4D4Xtfepr85fuDgA9kq96",
    });
    expect(value(reviewRequest(request), "Message")).toBe("Sign in");
  });

  test("marks a binary Solana message as unknown", () => {
    const request = solanaRequestToSignerRequest("signMessage", {
      message: new Uint8Array([0xff, 0xfe, 0x00]),
      publicKey: "oeYf6KAJkLYhBuR8CiGc6L4D4Xtfepr85fuDgA9kq96",
    });
    expect(reviewRequest(request).warning).toBeDefined();
  });
});
