import { StyleSheet, Text, TextInput, TextStyle, View } from "react-native";

import { theme } from "theme";

/**
 * A visible label, or a placeholder standing in for one — never neither.
 *
 * The union is what enforces it: `accessibilityLabel` falls back to the placeholder, so making
 * both optional would let an input with no accessible name typecheck, and a screen reader would
 * announce it as nothing at all.
 */
type Props = BaseProps & ({ label: string } | { placeholder: string });

type BaseProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  isSecure?: boolean;
  /** `email` turns off capitalisation and autocorrect, which otherwise mangle addresses. */
  kind?: "text" | "email";
  editable?: boolean;
  multiline?: boolean;
  style?: TextStyle;
};

export const TextField = ({
  label,
  value,
  onChangeText,
  placeholder,
  isSecure = false,
  kind = "text",
  editable = true,
  multiline = false,
  style,
}: Props) => (
  <View style={[styles.wrapper, !label && styles.shadow]}>
    {label && <Text style={styles.label}>{label}</Text>}
    <TextInput
      accessibilityLabel={label ?? placeholder}
      autoCapitalize={kind === "email" ? "none" : "sentences"}
      autoCorrect={kind !== "email"}
      editable={editable}
      keyboardType={kind === "email" ? "email-address" : "default"}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.muted}
      secureTextEntry={isSecure}
      style={[styles.input, !editable && styles.inputDisabled, style]}
      textContentType={kind === "email" ? "emailAddress" : isSecure ? "password" : "none"}
      value={value}
    />
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[4],
    borderRadius: theme.radius.sm,
  },
  label: { color: theme.colors.muted, fontSize: theme.font.sm.fontSize, fontWeight: "600" },
  shadow: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  input: {
    backgroundColor: theme.colors.surface.input,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    color: theme.colors.foreground,
    fontSize: theme.font.base.fontSize,
    minHeight: 48,
    paddingHorizontal: theme.spacing[12],
  },
  inputDisabled: { opacity: 0.6 },
});
