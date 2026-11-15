import { StyleSheet, Text, View } from "react-native";
import { Fingerprint, Plus, ScanLine, Wallet, WifiOff } from "lucide-react-native";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../app-store";
import {
  Button,
  colors,
  ErrorText,
  ListItem,
  Logo,
  Muted,
  Screen,
  styles,
  Title,
  Warning,
} from "../components/ui";
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
      <View style={local.header}>
        <Logo size={56} />
        <View style={styles.grow}>
          <Title>SlothSigner</Title>
          <View style={local.offline}>
            <WifiOff color={colors.muted} size={14} />
            <Muted>Offline signer</Muted>
          </View>
        </View>
      </View>
      <Muted>Keep this phone offline. It signs requests and never connects to a network.</Muted>
      {loadFailed ? <ErrorText>Your wallet list couldn't be loaded.</ErrorText> : null}
      {biometrics ? null : (
        <Warning icon={Fingerprint}>
          Set up a fingerprint in your phone's settings to protect your keys.
        </Warning>
      )}
      <Button
        title="Scan signing request"
        icon={ScanLine}
        disabled={wallets.length === 0}
        onPress={() => navigate({ name: "scan" })}
      />
      {wallets.length > 0 ? <Text style={styles.rowLabel}>Wallets</Text> : null}
      {wallets.map((wallet) => (
        <ListItem
          key={wallet.id}
          icon={Wallet}
          title={wallet.name}
          onPress={() => navigate({ name: "wallet", id: wallet.id })}
        >
          {wallet.accounts.map((account) => (
            <Text key={account.address} style={[styles.mono, { color: colors.muted }]}>
              {shortAddress(account.address)}
            </Text>
          ))}
        </ListItem>
      ))}
      {wallets.length === 0 ? <Muted>Add a wallet to start signing.</Muted> : null}
      <Button
        title="Add wallet"
        icon={Plus}
        variant="secondary"
        disabled={!biometrics}
        onPress={() => navigate({ name: "add-wallet" })}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  offline: { alignItems: "center", flexDirection: "row", gap: 4 },
});
