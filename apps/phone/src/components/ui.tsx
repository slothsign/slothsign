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

export const colors = {
  background: "#ffffff",
  surface: "#f4f4f5",
  border: "#e4e4e7",
  text: "#18181b",
  muted: "#71717a",
  primary: "#18181b",
  onPrimary: "#ffffff",
  danger: "#b91c1c",
  warningSurface: "#fef3c7",
  warningText: "#78350f",
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

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>{children}</Text>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.button, styles[`button_${variant}`], inactive && styles.inactive]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" ? colors.onPrimary : colors.text} />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{title}</Text>
      )}
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
  warning: { backgroundColor: colors.warningSurface, borderRadius: 10, padding: 12 },
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
