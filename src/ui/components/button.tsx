import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { theme } from "theme";

/**
 * Structural props only — a label and a callback. This component has no idea what it submits,
 * which is exactly why `src/ui/` never needs to import the backend (ADR 0002).
 */
type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  isLoading?: boolean;
  disabled?: boolean;
};

export const Button = ({
  label,
  onPress,
  variant = "primary",
  isLoading = false,
  disabled = false,
}: Props) => {
  const isDisabled = disabled || isLoading;
  const isPrimary = variant === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={isPrimary ? theme.colors.primaryText : theme.colors.primary} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelGhost]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: theme.radius.md,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
  },
  primary: { backgroundColor: theme.colors.primary },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  label: { fontSize: theme.font.md, fontWeight: "600" },
  labelPrimary: { color: theme.colors.primaryText },
  labelGhost: { color: theme.colors.primary },
});
