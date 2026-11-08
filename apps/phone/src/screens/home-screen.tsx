import { Pressable, Text } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../app-store";
import { Button, Card, ErrorText, Muted, Screen, styles, Title, Warning } from "../components/ui";
import { canUseBiometrics } from "../native/vault";

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function HomeScreen() {
  const { wallets, loadFailed, navigate } = useAppStore(
    useShallow((state) => ({
      wallets: state.registry.wallets,
      loadFailed: state.loadFailed,
      navigate: state.navigate,
    })),
  );
  const biometrics = canUseBiometrics();

  return (
    <Screen>
      <Title>SlothSigner</Title>
      <Muted>Keep this phone offline. It signs requests and never connects to a network.</Muted>
      {loadFailed ? <ErrorText>Your wallet list couldn't be loaded.</ErrorText> : null}
      {biometrics ? null : (
        <Warning>Set up a fingerprint in your phone's settings to protect your keys.</Warning>
      )}
      <Button
        title="Scan signing request"
        disabled={wallets.length === 0}
        onPress={() => navigate({ name: "scan" })}
      />
      {wallets.map((wallet) => (
        <Pressable
          key={wallet.id}
          accessibilityRole="button"
          onPress={() => navigate({ name: "wallet", id: wallet.id })}
        >
          <Card>
            <Text style={styles.rowValue}>{wallet.name}</Text>
            {wallet.accounts.map((account) => (
              <Text key={account.address} style={styles.mono}>
                {shortAddress(account.address)}
              </Text>
            ))}
          </Card>
        </Pressable>
      ))}
      {wallets.length === 0 ? <Muted>Add a wallet to start signing.</Muted> : null}
      <Button
        title="Add wallet"
        variant="secondary"
        disabled={!biometrics}
        onPress={() => navigate({ name: "add-wallet" })}
      />
    </Screen>
  );
}
