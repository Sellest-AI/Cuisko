import { ReactNode } from "react";
import { ButtonPill } from "./button-pill";
import { Icon, MorphIcon } from "./icons";
import { ViewStyle } from "react-native";

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
  style={style}
  leftContent={leftIcon ? <MorphIcon icon={leftIcon} size={20} /> : undefined}
  rightContent={rightIcon ? <MorphIcon icon={rightIcon} size={20} /> : undefined}
  size="md"
>
    {children}
  </ButtonPill>;
