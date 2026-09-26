import { ReactNode } from "react";
import { ButtonPill } from "./button-pill";
import { Icon, MorphIcon } from "./icons";
import { ViewStyle, StyleSheet } from "react-native";
import { theme } from "theme";

type StyleExtended = ViewStyle & { color?: string } | undefined;

type Props = {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "neutral";
  elevated?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  style?: StyleExtended | StyleExtended[];
  leftIcon?: Icon;
  rightIcon?: Icon;
  /** See `ButtonPill`. */
  doubleTapDelay?: number;
};

export const Button = ({
  children,
  onPress,
  variant = "primary",
  elevated = false,
  isLoading = false,
  disabled = false,
  style: buttonStyle,
  leftIcon,
  rightIcon,
  doubleTapDelay,
}: Props) => {
  const style = StyleSheet.flatten(buttonStyle) as StyleExtended;

  return <ButtonPill
    onPress={onPress}
    variant={variant}
    elevated={elevated}
    isLoading={isLoading}
    disabled={disabled}
    style={StyleSheet.flatten([styles.button, style])}
    leftContent={leftIcon ? ({ color }) => <MorphIcon icon={leftIcon} size={18} color={color} /> : undefined}
    rightContent={rightIcon ? ({ color }) => <MorphIcon icon={rightIcon} size={18} color={color} /> : undefined}
    size="md"
    doubleTapDelay={doubleTapDelay}
  >
    {children}
  </ButtonPill>
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[12],
    gap: theme.spacing[8],
  },
})
