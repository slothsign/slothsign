import { useAppStore } from "../app-store";
import { QrCode } from "../components/qr-code";
import { Button, Muted, Screen, Title } from "../components/ui";

export function ResultScreen({ qr }: { qr: string }) {
  const navigate = useAppStore((state) => state.navigate);
  return (
    <Screen>
      <Title>Signed</Title>
      <Muted>In SlothSign's browser window, choose Scan QR and point it at this code.</Muted>
      <QrCode value={qr} />
      <Button title="Done" onPress={() => navigate({ name: "home" })} />
    </Screen>
  );
}
