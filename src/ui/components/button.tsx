import { ReactNode } from "react";
import { ButtonPill } from "./button-pill";
import { Icon, MorphIcon } from "./icons";
import { ViewStyle, StyleSheet } from "react-native";
import { theme } from "theme";

type Props = {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "neutral";
  elevated?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  leftIcon?: Icon;
  rightIcon?: Icon;
};

export const Button = ({
  children,
  onPress,
  variant = "primary",
  elevated = false,
  isLoading = false,
  disabled = false,
  style,
  leftIcon,
  rightIcon,
}: Props) => <ButtonPill
  onPress={onPress}
  variant={variant}
  elevated={elevated}
  isLoading={isLoading}
  disabled={disabled}
  style={StyleSheet.flatten([styles.button, style])}
  leftContent={leftIcon ? <MorphIcon icon={leftIcon} size={18} /> : undefined}
  rightContent={rightIcon ? <MorphIcon icon={rightIcon} size={18} /> : undefined}
  size="md"
>
    {children}
  </ButtonPill>;

const styles = StyleSheet.create({
  button: {
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[12],
    gap: theme.spacing[8],
  }
})
