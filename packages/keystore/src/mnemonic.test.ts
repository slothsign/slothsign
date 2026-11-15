import { describe, expect, test } from "bun:test";
import {
  createMnemonic,
  isChecksummedMnemonic,
  isMnemonicWord,
  suggestMnemonicWords,
} from "./keystore.ts";

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

describe("suggestMnemonicWords", () => {
  test("lists words with the prefix, up to the limit", () => {
    expect(suggestMnemonicWords("aba")).toEqual(["abandon"]);
    expect(suggestMnemonicWords("ac", 3)).toEqual(["access", "accident", "account"]);
  });

  test("ignores case and surrounding space", () => {
    expect(suggestMnemonicWords(" ZOO ")).toEqual(["zoo"]);
  });

  test("returns nothing for an empty or unknown prefix", () => {
    expect(suggestMnemonicWords("")).toEqual([]);
    expect(suggestMnemonicWords("xyz")).toEqual([]);
  });

  test("four letters are enough to pin down any word", () => {
    expect(isMnemonicWord("abandon")).toBe(true);
    expect(isMnemonicWord("aband")).toBe(false);
    expect(suggestMnemonicWords("aban", 10)).toEqual(["abandon"]);
  });
});
