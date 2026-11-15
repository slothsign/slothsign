import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight, TriangleAlert, type LucideIcon } from "lucide-react-native";
import SlothLogo from "../assets/sloth.svg";

export const colors = {
  background: "#ffffff",
  surface: "#f4f4f5",
  border: "#e4e4e7",
  text: "#18181b",
  muted: "#71717a",
  primary: "#18181b",
  onPrimary: "#ffffff",
  danger: "#b91c1c",
  dangerSurface: "#fee2e2",
  success: "#15803d",
  successSurface: "#dcfce7",
  warningSurface: "#fef3c7",
  warningText: "#78350f",
};

const TONES = {
  neutral: { surface: colors.surface, text: colors.text },
  success: { surface: colors.successSurface, text: colors.success },
  danger: { surface: colors.dangerSurface, text: colors.danger },
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Logo({ size = 48 }: { size?: number }) {
  return <SlothLogo width={size} height={size} accessibilityLabel="SlothSigner" />;
}

/** An icon on a tinted square, to lead a card or a screen. */
export function IconBadge({
  icon: Icon,
  tone = "neutral",
  size = 40,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "success" | "danger";
  size?: number;
}) {
  const tint = TONES[tone];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tint.surface, borderRadius: size / 4, height: size, width: size },
      ]}
    >
      <Icon color={tint.text} size={size * 0.55} />
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

export function Warning({
  children,
  icon: Icon = TriangleAlert,
}: {
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <View style={styles.warning}>
      <Icon color={colors.warningText} size={20} />
      <Text style={[styles.warningText, styles.grow]}>{children}</Text>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const BUTTON_TEXT_COLORS = {
  primary: colors.onPrimary,
  secondary: colors.text,
  danger: colors.danger,
};

export function Button({
  title,
  onPress,
  icon: Icon,
  variant = "primary",
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = disabled || busy;
  const textColor = BUTTON_TEXT_COLORS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.button, styles[`button_${variant}`], inactive && styles.inactive]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {Icon ? <Icon color={textColor} size={20} /> : null}
          <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A tappable card row: icon, title, details, and a chevron. */
export function ListItem({
  icon,
  title,
  children,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.listItem, pressed && styles.pressed]}
    >
      <IconBadge icon={icon} />
      <View style={[styles.grow, { gap: 4 }]}>
        <Text style={styles.listTitle}>{title}</Text>
        {children}
      </View>
      <ChevronRight color={colors.muted} size={20} />
    </Pressable>
  );
}

export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text selectable style={[styles.rowValue, mono && styles.mono]}>
        {value}
      </Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        importantForAutofill="no"
        placeholderTextColor={colors.muted}
        spellCheck={false}
        style={[styles.input, input.multiline && styles.inputMultiline]}
        {...input}
      />
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: 16, padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  warning: {
    backgroundColor: colors.warningSurface,
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  listItem: { alignItems: "center", flexDirection: "row" },
  listTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  badge: { alignItems: "center", justifyContent: "center" },
  buttonContent: { alignItems: "center", flexDirection: "row", gap: 8 },
  warningText: { color: colors.warningText, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 12, gap: 12, padding: 16 },
  button: {
    alignItems: "center",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.surface },
  button_danger: { backgroundColor: colors.surface },
  inactive: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  buttonText_primary: { color: colors.onPrimary },
  buttonText_secondary: { color: colors.text },
  buttonText_danger: { color: colors.danger },
  row: { gap: 2 },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 15, lineHeight: 21 },
  mono: { fontFamily: "monospace", fontSize: 13, lineHeight: 19 },
  field: { gap: 6 },
  input: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  inputMultiline: { minHeight: 96, paddingVertical: 12, textAlignVertical: "top" },
});
