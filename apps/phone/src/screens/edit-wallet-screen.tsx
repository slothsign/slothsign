import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../app-store";
import { Button, ErrorText, Field, Muted, Screen, Title } from "../components/ui";
import { walletErrorMessage } from "../lib/registry";

const SAVE_FAILED = "Your changes weren't saved. New addresses need your fingerprint.";

export function EditWalletScreen({ id }: { id: string }) {
  const { wallet, editWallet, navigate } = useAppStore(
    useShallow((state) => ({
      wallet: state.registry.wallets.find((candidate) => candidate.id === id),
      editWallet: state.editWallet,
      navigate: state.navigate,
    })),
  );
  const [name, setName] = useState(wallet?.name ?? "");
  const [paths, setPaths] = useState(
    wallet?.accounts.map((account) => account.path ?? "").join("\n") ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!wallet) return null;
  const current = wallet;
  const hasPaths = current.kind === "mnemonic";

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await editWallet(current, { name, paths: hasPaths ? paths : undefined });
    } catch (e) {
      setError(walletErrorMessage(e, SAVE_FAILED));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Edit wallet</Title>
      <Field label="Wallet name" value={name} onChangeText={setName} />
      {hasPaths ? (
        <Field
          label="Addresses"
          hint="One derivation path per line. Adding a path asks for your fingerprint."
          multiline
          keyboardType="visible-password"
          value={paths}
          onChangeText={setPaths}
        />
      ) : null}
      <Muted>
        {hasPaths ? "The recovery phrase can't be changed." : "The private key can't be changed."}
      </Muted>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button title="Save" busy={busy} onPress={() => void save()} />
      <Button
        title="Cancel"
        variant="secondary"
        disabled={busy}
        onPress={() => navigate({ name: "wallet", id })}
      />
    </Screen>
  );
}
