import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "index.ts");
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TO = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";

const WALLETS_JSON = JSON.stringify({
  version: 1,
  wallets: [{ id: "test", kind: "privateKey", chain: "ethereum", privateKey: PRIVATE_KEY }],
});

/** The reported payload: fully priced, but with no `gas` field. */
const BROKEN_TX = {
  from: ADDRESS,
  to: TO,
  value: "0x0",
  nonce: "0x0",
  maxFeePerGas: "0x16e3600",
  maxPriorityFeePerGas: "0xf4240",
};

const COMPLETE_TX = { ...BROKEN_TX, gas: "0x5208" };

function signerRequest(tx: Record<string, unknown>): string {
  return JSON.stringify({
    version: 1,
    chain: "ethereum",
    chainId: "0x1",
    address: ADDRESS,
    type: "transaction",
    payload: JSON.stringify(tx),
  });
}

function binaryAvailable(name: string): boolean {
  return spawnSync(name, ["--version"], { encoding: "utf8" }).status === 0;
}

const ageAvailable = binaryAvailable("age") && binaryAvailable("age-keygen");

describe.skipIf(!ageAvailable)("sloth sign", () => {
  let dir: string;
  let env: Record<string, string>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sloth-cli-"));
    env = {
      ...(process.env as Record<string, string>),
      SLOTH_KEYSTORE: "age",
      SLOTH_IDENTITY: join(dir, "identity.txt"),
      SLOTH_WALLETS: join(dir, "wallets.age"),
      SLOTH_CACHE: join(dir, "addresses.json"),
    };
    const seed = spawnSync(process.execPath, [CLI, "wallet", "edit"], {
      env,
      input: WALLETS_JSON,
      encoding: "utf8",
    });
    if (seed.status !== 0) throw new Error(`failed to seed wallets: ${seed.stderr}`);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });
  }

  test("refuses an incomplete transaction instead of signing it", () => {
    const result = run(["sign", signerRequest(BROKEN_TX)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Incomplete EVM transaction: missing gas");
    expect(result.stdout).not.toContain("sloth://sig/");
  });

  test("signs a complete transaction", () => {
    const result = run(["sign", signerRequest(COMPLETE_TX)]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sloth://sig/");
  });
});
