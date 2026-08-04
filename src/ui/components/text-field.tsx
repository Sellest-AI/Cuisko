import { StyleSheet, Text, TextInput, View } from "react-native";

import { theme } from "theme";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  isSecure?: boolean;
  /** `email` turns off capitalisation and autocorrect, which otherwise mangle addresses. */
  kind?: "text" | "email";
  editable?: boolean;
};

export const TextField = ({
  label,
  value,
  onChangeText,
  placeholder,
  isSecure = false,
  kind = "text",
  editable = true,
}: Props) => (
  <View style={styles.wrapper}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      autoCapitalize={kind === "email" ? "none" : "sentences"}
      autoCorrect={kind !== "email"}
      editable={editable}
      keyboardType={kind === "email" ? "email-address" : "default"}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      secureTextEntry={isSecure}
      style={[styles.input, !editable && styles.inputDisabled]}
      textContentType={kind === "email" ? "emailAddress" : isSecure ? "password" : "none"}
      value={value}
    />
  </View>
);

const styles = StyleSheet.create({
  wrapper: { gap: theme.spacing.xs },
  label: { color: theme.colors.textMuted, fontSize: theme.font.sm, fontWeight: "600" },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.font.md,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
  },
  inputDisabled: { opacity: 0.6 },
});
