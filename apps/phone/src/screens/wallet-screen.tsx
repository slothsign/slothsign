import { useState } from "react";
import { Alert } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../app-store";
import { QrCode } from "../components/qr-code";
import { Button, Card, ErrorText, Muted, Row, Screen, Title } from "../components/ui";

const CHAIN_NAMES = { ethereum: "EVM", solana: "Solana" } as const;

export function WalletScreen({ id }: { id: string }) {
  const { wallet, navigate, removeWallet } = useAppStore(
    useShallow((state) => ({
      wallet: state.registry.wallets.find((candidate) => candidate.id === id),
      navigate: state.navigate,
      removeWallet: state.removeWallet,
    })),
  );
  const [shownAddress, setShownAddress] = useState<string>();
  const [error, setError] = useState<string>();

  if (!wallet) return null;
  const name = wallet.name;

  function confirmRemove() {
    Alert.alert(
      `Remove ${name}?`,
      "Its keys will be deleted from this phone. You can only restore it with your recovery phrase or private key.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeWallet(id).catch(() => setError("The wallet couldn't be removed."));
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Title>{name}</Title>
      <Muted>In SlothSign's browser extension, add each address using Address QR mode.</Muted>
      {wallet.accounts.map((account) => (
        <Card key={account.address}>
          <Row label={CHAIN_NAMES[account.chain]} value={account.address} mono />
          {account.path ? <Row label="Path" value={account.path} mono /> : null}
          {shownAddress === account.address ? <QrCode value={account.address} size={220} /> : null}
          <Button
            title={shownAddress === account.address ? "Hide QR" : "Show address QR"}
            variant="secondary"
            onPress={() =>
              setShownAddress(shownAddress === account.address ? undefined : account.address)
            }
          />
        </Card>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button title="Done" onPress={() => navigate({ name: "home" })} />
      <Button title="Remove wallet" variant="danger" onPress={confirmRemove} />
    </Screen>
  );
}
