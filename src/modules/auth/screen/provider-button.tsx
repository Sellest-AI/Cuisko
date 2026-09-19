import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { Loader } from "@ui/icons";
import { theme } from "theme";

const DISC_SIZE = 36;
const LOGO_SIZE = 18;

type Props = {
  label: string;
  logo: (props: { size?: number, color?: string }) => ReactNode;
  onPress: () => void;
  variant?: "secondary" | "neutral";
  isLoading?: boolean;
  disabled?: boolean;
};

/**
 * One "Continue with …" row: the provider's mark in a disc on the left, the label centred.
 *
 * The mark goes in `leftContent`, not `leftIcon`: `leftIcon` takes morphicons stroke data, and a
 * brand mark is a filled silhouette.
 */
export const ProviderButton = ({
  label, logo, onPress, variant = "neutral", isLoading = false, disabled = false,
}: Props) => {
  const isPrimary = variant === "secondary";
  const markColor = isPrimary ? theme.colors.white : theme.colors.foreground;

  return (
    <ButtonPill
      variant={variant}
      size="lg"
      elevated={isPrimary}
      isLoading={isLoading}
      disabled={disabled}
      onPress={onPress}
      style={styles.pill}
      leftContent={
        <View style={[styles.disc, styles.elevated, isPrimary ? styles.discPrimary : styles.discNeutral]}>
          {isLoading
            ? <Loader size={LOGO_SIZE} color={markColor} />
            : logo({ size: LOGO_SIZE, color: markColor })}
        </View>
      }
    >
      {label}
    </ButtonPill>
  );
};

const styles = StyleSheet.create({
  pill: { alignSelf: "stretch", paddingHorizontal: theme.spacing[6] },
  disc: {
    alignItems: "center",
    borderRadius: theme.radius.full,
    height: DISC_SIZE,
    justifyContent: "center",
    width: DISC_SIZE,
    marginLeft: theme.spacing[2]
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.2)",
      },
    ],
  },
  discPrimary: { backgroundColor: theme.colors.secondary.base },
  discNeutral: { backgroundColor: theme.colors.white },
});
