import { useMemo } from "react";
import { View } from "react-native";
import QRCode from "qrcode";
import Svg, { Path } from "react-native-svg";

const QUIET_ZONE = 2;

export function QrCode({ value, size = 280 }: { value: string; size?: number }) {
  const { path, modules } = useMemo(() => {
    const matrix = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
    let d = "";
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (matrix.get(x, y)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { path: d, modules: matrix.size + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <View
      accessibilityLabel="QR code"
      style={{ alignSelf: "center", backgroundColor: "#ffffff", height: size, width: size }}
    >
      <Svg height={size} viewBox={`0 0 ${modules} ${modules}`} width={size}>
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}
