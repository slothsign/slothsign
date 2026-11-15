import { isMnemonicWord } from "@slothsign/keystore";

/** Word counts a BIP-39 recovery phrase can have. */
export const PHRASE_LENGTHS = [12, 15, 18, 21, 24] as const;

export function emptyWords(count: number): string[] {
  return Array.from({ length: count }, () => "");
}

/** Change the slot count, keeping the words already entered. */
export function resizeWords(words: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => words[index] ?? "");
}

/** The first blank slot at or after `from`, wrapping around; `undefined` when full. */
export function nextBlank(words: string[], from: number): number | undefined {
  for (let offset = 0; offset < words.length; offset++) {
    const index = (from + offset) % words.length;
    if (!words[index]) return index;
  }
  return undefined;
}

export interface PasteResult {
  words: string[];
  /** Typed text left over: the first token that isn't a wordlist word, if any. */
  rest: string;
  /** Slot to continue typing in. */
  next: number | undefined;
}

/**
 * Place pasted or space-separated words from slot `start`. Stops at the first
 * token that isn't a wordlist word and hands it back as text still being typed.
 * Pasting a whole phrase into the first slot resizes to its length.
 */
export function placeWords(words: string[], start: number, text: string): PasteResult {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const fitsWhole =
    start === 0 &&
    (PHRASE_LENGTHS as readonly number[]).includes(tokens.length) &&
    tokens.every(isMnemonicWord);
  const result = fitsWhole ? emptyWords(tokens.length) : [...words];
  let slot = start;
  for (const token of tokens) {
    if (slot >= result.length) break;
    if (!isMnemonicWord(token)) return { words: result, rest: token, next: slot };
    result[slot] = token;
    slot++;
  }
  return { words: result, rest: "", next: nextBlank(result, slot) };
}
