import { describe, expect, test } from "bun:test";
import { createMnemonic, isChecksummedMnemonic } from "./keystore.ts";

describe("isChecksummedMnemonic", () => {
  test("accepts a generated mnemonic", () => {
    expect(isChecksummedMnemonic(createMnemonic())).toBe(true);
  });

  test("rejects valid words with a bad checksum", () => {
    expect(isChecksummedMnemonic(Array(12).fill("test").join(" "))).toBe(false);
  });

  test("rejects words outside the wordlist", () => {
    expect(isChecksummedMnemonic(`${Array(11).fill("test").join(" ")} notaword`)).toBe(false);
  });
});
