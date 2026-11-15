import { useEffect, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { createMnemonic, isChecksummedMnemonic } from "@slothsign/keystore";
import { DEFAULT_PATHS } from "@slothsign/signing";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  ListOrdered,
  RefreshCw,
  Sparkles,
  Square,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react-native";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../app-store";
import { PhraseEntry } from "../components/phrase-entry";
import {
  Button,
  Card,
  colors,
  ErrorText,
  Field,
  ListItem,
  Muted,
  Screen,
  styles,
  Title,
} from "../components/ui";
import { emptyWords } from "../lib/phrase-entry";
import { walletErrorMessage, type WalletDraft } from "../lib/registry";

type Mode = "create" | "phrase" | "key";
type Step = "choose" | "secret" | "details";

const MODES: { mode: Mode; icon: LucideIcon; label: string; description: string }[] = [
  {
    mode: "create",
    icon: Sparkles,
    label: "Create a new wallet",
    description: "Generate a fresh recovery phrase on this phone.",
  },
  {
    mode: "phrase",
    icon: ListOrdered,
    label: "Import a recovery phrase",
    description: "Enter the 12 to 24 words of an existing wallet.",
  },
  {
    mode: "key",
    icon: KeyRound,
    label: "Import a private key",
    description: "Add a single Ethereum or Solana account.",
  },
];

const SECRET_TITLES: Record<Mode, string> = {
  create: "Back up your recovery phrase",
  phrase: "Enter your recovery phrase",
  key: "Enter your private key",
};

const STEP_NUMBERS: Record<Step, number> = { choose: 1, secret: 2, details: 3 };

const SAVE_FAILED = "The wallet wasn't saved. Unlock with your fingerprint to continue.";

/** Let the progress indicator paint before key derivation blocks the UI. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

export function AddWalletScreen() {
  const { addWallet, navigate } = useAppStore(
    useShallow((state) => ({ addWallet: state.addWallet, navigate: state.navigate })),
  );
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<Mode>("create");
  const [generated, setGenerated] = useState<string>();
  const [backedUp, setBackedUp] = useState(false);
  const [words, setWords] = useState(() => emptyWords(12));
  const [privateKey, setPrivateKey] = useState("");
  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [paths, setPaths] = useState(DEFAULT_PATHS.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const phrase = words.join(" ");
  const phraseComplete = words.every(Boolean);
  const phraseValid = phraseComplete && isChecksummedMnemonic(phrase);

  function goTo(next: Step) {
    setError(undefined);
    setStep(next);
  }

  function back() {
    if (busy) return;
    if (step === "details") goTo("secret");
    else if (step === "secret") goTo("choose");
    else navigate({ name: "home" });
  }

  // Hardware back steps through the flow instead of discarding it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => subscription.remove();
  });

  function choose(next: Mode) {
    setMode(next);
    // Keep earlier words, so a phrase already written down stays valid.
    if (next === "create" && !generated) generate();
    goTo("secret");
  }

  /** New words invalidate anything written down, so the backup must be confirmed again. */
  function generate() {
    setGenerated(createMnemonic());
    setBackedUp(false);
  }

  function regenerate() {
    if (!backedUp) {
      generate();
      return;
    }
    Alert.alert("Replace these words?", "The words you wrote down won't work for this wallet.", [
      { text: "Cancel", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: generate },
    ]);
  }

  function draft(): WalletDraft {
    if (mode === "key") return { kind: "privateKey", name, privateKey };
    return {
      kind: "mnemonic",
      name,
      mnemonic: mode === "create" ? (generated ?? "") : phrase,
      passphrase,
      paths,
    };
  }

  async function save() {
    setBusy(true);
    setError(undefined);
    await nextPaint();
    try {
      await addWallet(draft());
    } catch (e) {
      setError(walletErrorMessage(e, SAVE_FAILED));
      setBusy(false);
    }
  }

  const secretReady =
    mode === "create" ? backedUp : mode === "phrase" ? phraseValid : privateKey.trim() !== "";

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Muted>Step {STEP_NUMBERS[step]} of 3</Muted>
        <Title>
          {step === "choose"
            ? "Add wallet"
            : step === "secret"
              ? SECRET_TITLES[mode]
              : "Name your wallet"}
        </Title>
      </View>

      {step === "choose" ? (
        <>
          {MODES.map((item) => (
            <ListItem
              key={item.mode}
              icon={item.icon}
              title={item.label}
              onPress={() => choose(item.mode)}
            >
              <Muted>{item.description}</Muted>
            </ListItem>
          ))}
          <Button title="Cancel" icon={ArrowLeft} variant="secondary" onPress={back} />
        </>
      ) : null}

      {step === "secret" && mode === "create" && generated ? (
        <>
          <Muted>
            Write these words on paper, in order. They are the only way to recover this wallet if
            this phone is lost or its fingerprints change.
          </Muted>
          <Card>
            <View style={local.wordGrid}>
              {generated.split(" ").map((word, index) => (
                <View key={index} style={local.word}>
                  <Text style={local.wordNumber}>{index + 1}</Text>
                  <Text selectable={false} style={styles.mono}>
                    {word}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
          <Button title="Regenerate" icon={RefreshCw} variant="secondary" onPress={regenerate} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: backedUp }}
            onPress={() => setBackedUp(!backedUp)}
            style={[styles.button, styles.button_secondary]}
          >
            <View style={styles.buttonContent}>
              {backedUp ? (
                <SquareCheckBig color={colors.success} size={20} />
              ) : (
                <Square color={colors.text} size={20} />
              )}
              <Text style={styles.buttonText}>I wrote them down</Text>
            </View>
          </Pressable>
        </>
      ) : null}

      {step === "secret" && mode === "phrase" ? (
        <>
          <PhraseEntry words={words} onChange={setWords} />
          {phraseComplete && !phraseValid ? (
            <ErrorText>
              These words don't form a valid recovery phrase. Check each word and its order.
            </ErrorText>
          ) : null}
        </>
      ) : null}

      {step === "secret" && mode === "key" ? (
        <Field
          label="Private key"
          secureTextEntry
          keyboardType="visible-password"
          value={privateKey}
          onChangeText={setPrivateKey}
        />
      ) : null}

      {step === "secret" ? (
        <>
          <Button
            title="Continue"
            icon={ArrowRight}
            disabled={!secretReady}
            onPress={() => goTo("details")}
          />
          <Button title="Back" icon={ArrowLeft} variant="secondary" onPress={back} />
        </>
      ) : null}

      {step === "details" ? (
        <>
          <Field
            label="Wallet name"
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Main"
          />
          {mode === "key" ? null : (
            <>
              <Field
                label="Passphrase (optional)"
                secureTextEntry
                value={passphrase}
                onChangeText={setPassphrase}
              />
              <Field
                label="Addresses to add"
                hint="One derivation path per line. Only these addresses can sign."
                multiline
                keyboardType="visible-password"
                value={paths}
                onChangeText={setPaths}
              />
            </>
          )}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button title="Save wallet" icon={Check} busy={busy} onPress={() => void save()} />
          <Button
            title="Back"
            icon={ArrowLeft}
            variant="secondary"
            disabled={busy}
            onPress={back}
          />
        </>
      ) : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  wordGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  word: { flexBasis: "33%", flexDirection: "row", gap: 6 },
  wordNumber: { color: colors.muted, fontSize: 12, minWidth: 18, textAlignVertical: "center" },
});
