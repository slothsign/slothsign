import { View } from "react-native";
import { Check, CircleCheckBig } from "lucide-react-native";
import { useAppStore } from "../app-store";
import { QrCode } from "../components/qr-code";
import { Button, IconBadge, Muted, Screen, Title } from "../components/ui";

export function ResultScreen({ qr }: { qr: string }) {
  const navigate = useAppStore((state) => state.navigate);
  return (
    <Screen>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <IconBadge icon={CircleCheckBig} tone="success" size={48} />
        <Title>Signed</Title>
      </View>
      <Muted>In SlothSign's browser window, choose Scan QR and point it at this code.</Muted>
      <QrCode value={qr} />
      <Button title="Done" icon={Check} onPress={() => navigate({ name: "home" })} />
    </Screen>
  );
}
