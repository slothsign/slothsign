import { describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils.js";
import { derivePrivateKey, deriveSolanaPrivateKey, slip0010Seed, EVM_PATH } from "./derive.ts";

const MNEMONIC = "repair item secret false deliver skin salmon guard inspire pill lesson adult";

describe("derivePrivateKey", () => {
  test("derives the EVM key at m/44'/60'/0'/0/0", () => {
    const key = derivePrivateKey(MNEMONIC, EVM_PATH);
    expect(bytesToHex(key)).toBe(
      "54d159711152c4a1592d0a38d8b95ff8f36abd130e1001d6542ade33c0e18c29",
    );
  });

  test("honors a BIP-39 passphrase", () => {
    const plain = derivePrivateKey(MNEMONIC, EVM_PATH);
    const protectedKey = derivePrivateKey(MNEMONIC, EVM_PATH, "passphrase");
    expect(bytesToHex(protectedKey)).not.toBe(bytesToHex(plain));
  });
});

describe("slip0010Seed", () => {
  // Official SLIP-0010 ed25519 test vectors.
  const SEED = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  test("matches the SLIP-0010 master key vector", () => {
    expect(bytesToHex(slip0010Seed(SEED, "m"))).toBe(
      "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7",
    );
  });

  test("matches the SLIP-0010 m/0' vector", () => {
    expect(bytesToHex(slip0010Seed(SEED, "m/0'"))).toBe(
      "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3",
    );
  });

  test("matches the SLIP-0010 m/0'/1' vector", () => {
    expect(bytesToHex(slip0010Seed(SEED, "m/0'/1'"))).toBe(
      "b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2",
    );
  });

  test("accepts 'h' and trailing-slash path syntax", () => {
    expect(bytesToHex(slip0010Seed(SEED, "m/0h"))).toBe(bytesToHex(slip0010Seed(SEED, "m/0'")));
  });

  test("rejects non-hardened children", () => {
    expect(() => slip0010Seed(SEED, "m/0")).toThrow();
  });
});

describe("deriveSolanaPrivateKey", () => {
  test("returns a 32-byte seed at the default path", () => {
    expect(deriveSolanaPrivateKey(MNEMONIC).length).toBe(32);
  });

  test("honors an explicit path and passphrase", () => {
    const a = deriveSolanaPrivateKey(MNEMONIC, "m/44'/501'/0'/0'", "p");
    const b = deriveSolanaPrivateKey(MNEMONIC, "m/44'/501'/1'/0'");
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});
