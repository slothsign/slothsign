import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppStore } from "../app-store";
import { Button, ErrorText, Muted, Screen, styles as ui, Title } from "../components/ui";
import { RequestScanner } from "../lib/request-scanner";

export function ScanScreen() {
  const navigate = useAppStore((state) => state.navigate);
  const reviewScanned = useAppStore((state) => state.reviewScanned);
  const [permission, requestPermission] = useCameraPermissions();
  const [percent, setPercent] = useState<number>();
  const [error, setError] = useState<string>();
  const scanner = useRef(new RequestScanner());

  function restart() {
    scanner.current = new RequestScanner();
    setPercent(undefined);
    setError(undefined);
  }

  function onScanned(text: string) {
    const progress = scanner.current.accept(text);
    if (!progress) return;
    if (progress.status === "scanning") {
      setPercent(progress.percent);
    } else if (progress.status === "error") {
      setError(progress.message);
    } else {
      const problem = reviewScanned(progress.request);
      if (problem) setError(problem);
    }
  }

  if (!permission?.granted) {
    return (
      <Screen>
        <Title>Scan request</Title>
        <Muted>SlothSigner needs the camera to read signing requests.</Muted>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
        <Button title="Cancel" variant="secondary" onPress={() => navigate({ name: "home" })} />
      </Screen>
    );
  }

  return (
    <SafeAreaView style={ui.screen}>
      {error ? (
        <View style={styles.placeholder}>
          <ErrorText>{error}</ErrorText>
        </View>
      ) : (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={(result) => onScanned(result.data)}
        />
      )}
      <View style={styles.panel}>
        {error ? (
          <Button title="Scan again" onPress={restart} />
        ) : (
          <Text style={ui.rowValue}>
            {percent === undefined ? "Point the camera at the QR code" : `Reading… ${percent}%`}
          </Text>
        )}
        <Button title="Cancel" variant="secondary" onPress={() => navigate({ name: "home" })} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  placeholder: { flex: 1, justifyContent: "center", padding: 20 },
  panel: { gap: 12, padding: 20 },
});
