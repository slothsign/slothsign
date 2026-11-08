import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { createMnemonic } from "@slothsign/keystore";
import { DEFAULT_PATHS } from "@slothsign/signing";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../app-store";
import { Button, Card, ErrorText, Field, Muted, Screen, styles, Title } from "../components/ui";
import { walletErrorMessage, type WalletDraft } from "../lib/registry";

type Mode = "create" | "phrase" | "key";

const MODES: { mode: Mode; label: string }[] = [
  { mode: "create", label: "Create" },
  { mode: "phrase", label: "Phrase" },
  { mode: "key", label: "Private key" },
];

const SAVE_FAILED = "The wallet wasn't saved. Unlock with your fingerprint to continue.";

/** Let the progress indicator paint before key derivation blocks the UI. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

export function AddWalletScreen() {
  const { addWallet, navigate } = useAppStore(
    useShallow((state) => ({ addWallet: state.addWallet, navigate: state.navigate })),
  );
  const [mode, setMode] = useState<Mode>("create");
  const [generated, setGenerated] = useState<string>();
  const [name, setName] = useState("");
  const [phrase, setPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [paths, setPaths] = useState(DEFAULT_PATHS.join("\n"));
  const [privateKey, setPrivateKey] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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

  /** New words invalidate anything written down, so the backup must be confirmed again. */
  function generate() {
    setGenerated(createMnemonic());
    setBackedUp(false);
    setError(undefined);
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

  return (
    <Screen>
      <Title>Add wallet</Title>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {MODES.map((item) => (
          <Pressable
            key={item.mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === item.mode }}
            onPress={() => {
              setMode(item.mode);
              setError(undefined);
            }}
            style={[
              styles.button,
              styles.button_secondary,
              { flex: 1 },
              mode === item.mode && styles.button_primary,
            ]}
          >
            <Text style={[styles.buttonText, mode === item.mode && styles.buttonText_primary]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field label="Wallet name" value={name} onChangeText={setName} placeholder="Main" />

      {mode === "create" && !generated ? (
        <Button title="Generate recovery phrase" onPress={generate} />
      ) : null}

      {mode === "create" && generated ? (
        <>
          <Card>
            <Text style={styles.rowLabel}>Recovery phrase</Text>
            <Text selectable={false} style={[styles.rowValue, styles.mono]}>
              {generated
                .split(" ")
                .map((word, index) => `${index + 1}. ${word}`)
                .join("\n")}
            </Text>
          </Card>
          <Button title="Regenerate" variant="secondary" disabled={busy} onPress={regenerate} />
          <Muted>
            Write these words on paper, in order. They are the only way to recover this wallet if
            this phone is lost or its fingerprints change.
          </Muted>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: backedUp }}
            onPress={() => setBackedUp(!backedUp)}
            style={[styles.button, styles.button_secondary]}
          >
            <Text style={styles.buttonText}>{backedUp ? "☑" : "☐"} I wrote them down</Text>
          </Pressable>
        </>
      ) : null}

      {mode === "phrase" ? (
        <Field
          label="Recovery phrase"
          multiline
          keyboardType="visible-password"
          value={phrase}
          onChangeText={setPhrase}
        />
      ) : null}

      {mode === "key" ? (
        <Field
          label="Private key"
          secureTextEntry
          keyboardType="visible-password"
          value={privateKey}
          onChangeText={setPrivateKey}
        />
      ) : null}

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
      <Button
        title="Save wallet"
        busy={busy}
        disabled={mode === "create" && !backedUp}
        onPress={() => void save()}
      />
      <Button title="Cancel" variant="secondary" onPress={() => navigate({ name: "home" })} />
    </Screen>
  );
}
