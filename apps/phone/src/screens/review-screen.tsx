import { useMemo, useState } from "react";
import { Text } from "react-native";
import type { SignerRequest } from "@slothsign/core";
import { encodeResult } from "@slothsign/core";
import { encodeSlothResultUr } from "@slothsign/qr-codec/sloth";
import { signRequest } from "@slothsign/signing";
import { useAppStore } from "../app-store";
import { Button, Card, ErrorText, Row, Screen, styles, Title, Warning } from "../components/ui";
import type { RegistryAccount, RegistryWallet } from "../lib/registry";
import { fullRequestText, reviewRequest } from "../lib/review";
import { readSecret } from "../native/vault";

const UNLOCK_FAILED =
  "Couldn't unlock this wallet. If your fingerprints changed, remove it and restore it from your recovery phrase.";
const SIGN_FAILED = "This request is incomplete or doesn't match this wallet, so it wasn't signed.";

/** Let the progress indicator paint before key derivation blocks the UI. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

export function ReviewScreen({
  request,
  wallet,
  account,
}: {
  request: SignerRequest;
  wallet: RegistryWallet;
  account: RegistryAccount;
}) {
  const navigate = useAppStore((state) => state.navigate);
  const review = useMemo(() => reviewRequest(request), [request]);
  const fullRequest = useMemo(() => fullRequestText(request), [request]);
  const [expanded, setExpanded] = useState(review.showFullRequest ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function sign() {
    setBusy(true);
    setError(undefined);
    let secret;
    try {
      secret = await readSecret(wallet.id);
    } catch {
      setError(UNLOCK_FAILED);
      setBusy(false);
      return;
    }
    await nextPaint();
    try {
      const result = await signRequest(request, secret, account.path, {
        detachedSolanaTransaction: true,
      });
      const qr = encodeSlothResultUr(encodeResult({ chain: request.chain, result }));
      navigate({ name: "result", qr });
    } catch {
      setError(SIGN_FAILED);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{review.title}</Title>
      {review.warning ? <Warning>{review.warning}</Warning> : null}
      <Card>
        <Row label="Wallet" value={wallet.name} />
        <Row label="Address" value={account.address} mono />
        {review.rows.map((row) => (
          <Row key={row.label} {...row} />
        ))}
      </Card>
      <Button
        title={expanded ? "Hide full request" : "Show full request"}
        variant="secondary"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <Card>
          <Text selectable style={styles.mono}>
            {fullRequest}
          </Text>
        </Card>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button title="Sign" busy={busy} onPress={() => void sign()} />
      <Button
        title="Reject"
        variant="secondary"
        disabled={busy}
        onPress={() => navigate({ name: "home" })}
      />
    </Screen>
  );
}
