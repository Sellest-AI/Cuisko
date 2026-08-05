import { colors, theme } from "theme";
import { Icon, LoaderCircle, MorphIcon } from "./icons";
import { Pressable } from "./pressable"
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useSpin } from "@ui/hooks/useSpin";

type Props = {
  children: Icon;
  variant?: "primary" | "primary-subtle" | "secondary" | "secondary-subtle" | "neutral" | "neutral-subtle";
  elevated?: boolean;
  isLoading?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  style?: ViewStyle;
} & Action;

type Action = { composite?: false; onPress: () => void, disabled?: boolean } |
{ composite: true; onPress?: undefined, disabled?: false };

export const ButtonIcon = ({
  children,
  onPress,
  disabled,
  variant = "primary",
  composite = false,
  elevated = false,
  size = "md",
  isLoading = false,
  style,
}: Props) => {
  const spin = useSpin(isLoading);

  const color = variant === "primary" ? styles.primary :
    variant === "primary-subtle" ? styles.primaryElevated :
      variant === "secondary" ? styles.secondary :
        variant === "secondary-subtle" ? styles.secondaryElevated :
          styles.neutral;

  const padding =
    size === "xs" ? 6 :
      size === "sm" ? 10 :
        size === "md" ? 12 :
          size === "lg" ? 16 : 18;

  const Component = composite ? View : Pressable;

  return (
    <Component
      style={{ alignSelf: "flex-start", ...style }}
      onPress={onPress}
      disabled={disabled || isLoading}
    >
      <View style={[
        styles.base,
        elevated && styles.elevated,
        color,
        { padding },
      ]}>
        <Animated.View style={spin}>
          <MorphIcon
            size={20}
            color={color.color}
            icon={isLoading ? LoaderCircle : children}
          />
        </Animated.View>
      </View>
    </Component>
  )
}

const styles = StyleSheet.create({
  base: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.full,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.border.default,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: -2,
        offsetY: 2,
        blurRadius: 16,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  primary: {
    backgroundColor: colors.primary.base,
    color: colors.primary.foreground,
  },
  primaryElevated: {
    backgroundColor: colors.primary.elevated,
    color: colors.primary.foreground,
  },
  secondary: {
    backgroundColor: colors.secondary.base,
    color: colors.secondary.foreground,
  },
  secondaryElevated: {
    backgroundColor: colors.secondary.elevated,
    color: colors.secondary.foreground,
  },
  neutral: {
    backgroundColor: colors.surface.elevatedSubtle,
    color: colors.foreground,
  }
})
