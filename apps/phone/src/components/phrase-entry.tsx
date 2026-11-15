import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import { isMnemonicWord, suggestMnemonicWords } from "@slothsign/keystore";
import { nextBlank, PHRASE_LENGTHS, placeWords, resizeWords } from "../lib/phrase-entry";
import { colors, Muted, styles as ui } from "./ui";

/**
 * Recovery phrase entry one word at a time: type a few letters, then pick the
 * word from the suggestions. Tap a numbered slot to correct it.
 */
export function PhraseEntry({
  words,
  onChange,
}: {
  words: string[];
  onChange: (words: string[]) => void;
}) {
  const input = useRef<TextInputInstance>(null);
  const [active, setActive] = useState<number | undefined>(() => nextBlank(words, 0));
  const [draft, setDraft] = useState("");
  const suggestions = suggestMnemonicWords(draft);
  const noMatch = draft.length > 0 && suggestions.length === 0;

  function focus(index: number | undefined) {
    setActive(index);
    setDraft("");
    if (index === undefined) input.current?.blur();
    else input.current?.focus();
  }

  function pick(word: string) {
    if (active === undefined) return;
    const next = [...words];
    next[active] = word;
    onChange(next);
    focus(nextBlank(next, active + 1));
  }

  function type(text: string) {
    if (active === undefined) return;
    if (!/\s/.test(text)) {
      setDraft(text.toLowerCase());
      return;
    }
    // A space or paste: settle what was typed. A lone prefix with one match counts as that word.
    const single = text.trim().toLowerCase();
    const unique = suggestMnemonicWords(single, 2);
    if (!/\s/.test(single) && !isMnemonicWord(single) && unique.length === 1) {
      pick(unique[0]!);
      return;
    }
    const placed = placeWords(words, active, text);
    onChange(placed.words);
    setActive(placed.next);
    setDraft(placed.rest);
    if (placed.next === undefined) input.current?.blur();
  }

  function submit() {
    const exact = isMnemonicWord(draft) ? draft : undefined;
    const choice = exact ?? (suggestions.length === 1 ? suggestions[0] : undefined);
    if (choice) pick(choice);
  }

  function backspace() {
    if (draft || active === undefined || active === 0 || words[active]) return;
    // Backspace on an empty slot reopens the previous word for editing.
    const previous = active - 1;
    const next = [...words];
    const word = next[previous] ?? "";
    next[previous] = "";
    onChange(next);
    setActive(previous);
    setDraft(word.slice(0, -1));
  }

  function resize(count: number) {
    const next = resizeWords(words, count);
    onChange(next);
    focus(nextBlank(next, 0));
  }

  return (
    <View style={ui.field}>
      <Text style={ui.rowLabel}>Number of words</Text>
      <View style={local.lengths}>
        {PHRASE_LENGTHS.map((count) => (
          <Pressable
            key={count}
            accessibilityRole="radio"
            accessibilityState={{ selected: words.length === count }}
            onPress={() => resize(count)}
            style={[local.chip, words.length === count && local.chipSelected]}
          >
            <Text style={[local.chipText, words.length === count && local.chipTextSelected]}>
              {count}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={local.grid}>
        {words.map((word, index) => (
          <Pressable
            key={index}
            accessibilityLabel={`Word ${index + 1}${word ? `, ${word}` : ", empty"}`}
            onPress={() => focus(index)}
            style={[local.slot, active === index && local.slotActive]}
          >
            <Text style={local.slotNumber}>{index + 1}</Text>
            <Text style={local.slotWord} numberOfLines={1}>
              {(active === index && draft) || word || " "}
            </Text>
          </Pressable>
        ))}
      </View>

      {active === undefined ? (
        <Muted>All words entered. Tap a word to change it.</Muted>
      ) : (
        <>
          <Text style={ui.rowLabel}>Word {active + 1}</Text>
          <TextInput
            ref={input}
            autoFocus
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            keyboardType="visible-password"
            spellCheck={false}
            placeholder="Type the first letters"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            submitBehavior="submit"
            style={[ui.input, noMatch && local.inputInvalid]}
            value={draft}
            onChangeText={type}
            onSubmitEditing={submit}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "Backspace") backspace();
            }}
          />
          <View style={local.suggestions}>
            {suggestions.map((word) => (
              <Pressable
                key={word}
                accessibilityRole="button"
                onPress={() => pick(word)}
                style={local.suggestion}
              >
                <Text style={local.suggestionText}>{word}</Text>
              </Pressable>
            ))}
            {noMatch ? <Text style={ui.error}>No recovery word starts with “{draft}”.</Text> : null}
          </View>
        </>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  lengths: { flexDirection: "row", gap: 8 },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chipTextSelected: { color: colors.onPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "30%",
    flexDirection: "row",
    flexGrow: 1,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 8,
  },
  slotActive: { borderColor: colors.primary, borderWidth: 2 },
  slotNumber: { color: colors.muted, fontSize: 12, minWidth: 18 },
  slotWord: { color: colors.text, flexShrink: 1, fontFamily: "monospace", fontSize: 14 },
  inputInvalid: { borderColor: colors.danger },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, minHeight: 44 },
  suggestion: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  suggestionText: { color: colors.text, fontSize: 16, fontWeight: "600" },
});
