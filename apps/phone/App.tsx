import { useEffect } from "react";
import { BackHandler } from "react-native";
import { usePreventScreenCapture } from "expo-screen-capture";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppStore, type Route } from "./src/app-store";
import { AddWalletScreen } from "./src/screens/add-wallet-screen";
import { EditWalletScreen } from "./src/screens/edit-wallet-screen";
import { HomeScreen } from "./src/screens/home-screen";
import { ResultScreen } from "./src/screens/result-screen";
import { ReviewScreen } from "./src/screens/review-screen";
import { ScanScreen } from "./src/screens/scan-screen";
import { WalletScreen } from "./src/screens/wallet-screen";

function CurrentScreen({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <HomeScreen />;
    case "add-wallet":
      return <AddWalletScreen />;
    case "wallet":
      return <WalletScreen id={route.id} />;
    case "edit-wallet":
      return <EditWalletScreen id={route.id} />;
    case "scan":
      return <ScanScreen />;
    case "review":
      return <ReviewScreen {...route} />;
    case "result":
      return <ResultScreen qr={route.qr} />;
  }
}

export default function App() {
  usePreventScreenCapture();
  const route = useAppStore((state) => state.route);
  const loaded = useAppStore((state) => state.loaded);

  useEffect(() => {
    void useAppStore.getState().load();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const { route: current, navigate } = useAppStore.getState();
      if (current.name === "home") return false;
      navigate({ name: "home" });
      return true;
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {loaded ? <CurrentScreen route={route} /> : null}
    </SafeAreaProvider>
  );
}
