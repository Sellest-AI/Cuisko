import { colors, theme } from "theme";
import { Icon, LoaderCircle, MorphIcon } from "./icons";
import { Pressable } from "./pressable"
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useSpin } from "@ui/hooks/useSpin";
import { BlurView } from "./blur-view";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  children: Icon;
  variant?: "primary" | "primary-subtle" | "secondary" | "secondary-subtle" | "neutral" | "neutral-inverted" | "neutral-subtle" | "danger";
  elevated?: boolean;
  isLoading?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  style?: ViewStyle;
  disabled?: boolean;
  onPress?: () => void;
  /**
   * The icon is one part of a larger control — a `ButtonPill` side, an `ActionRow` — rather than a
   * button in its own right. Visual only: it drives the press animation. It used to swap the
   * `Pressable` for a `View`, which is why it once forbade `onPress`; now that the icon is
   * pressable either way, the two are independent and a side icon can carry its own handler.
   */
  composite?: boolean;
};

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

  const color = variant === "danger" ? styles.danger :
    variant === "primary" ? styles.primary :
      variant === "primary-subtle" ? styles.primaryElevated :
        variant === "secondary" ? styles.secondary :
          variant === "secondary-subtle" ? styles.secondaryElevated :
            variant === "neutral" ? styles.neutral :
              variant === "neutral-inverted" ? styles.neutralInverted :
                styles.neutralSubtle;

  const padding =
    size === "xs" ? 8 :
      size === "sm" ? 10 :
        size === "md" ? 12 :
          size === "lg" ? 16 : 18;

  const isBaseNeutral = variant.includes("neutral") && !variant.includes("inverted");

  const Component = isBaseNeutral ? BlurView : View;

  const elevation = variant === "neutral-inverted" ?
    styles.elevated : styles.elevatedSubtle;

  const borderWidth = variant === "neutral-inverted" ? 1 : 2;

  const hasGradient = variant === "neutral-inverted" || (variant === "danger" && elevated);

  return (
    <Pressable
      style={{
        alignSelf: "flex-start",
        pointerEvents: composite ? "none" : "auto",
        ...style
      }}
      onPress={onPress}
      disabled={disabled || isLoading}
      animated={!composite}
    >
      <Component
        tint="light"
        style={[
          styles.base,
          elevated && elevation,
          color,
          { padding, borderWidth },
        ]}>
        {hasGradient && (
          <LinearGradient
            colors={
              variant === "neutral-inverted" ? [theme.colors.neutral.base, theme.colors.neutral.muted] :
                [theme.colors.danger.base, theme.colors.danger.elevated]}
            style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.full }]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
          />
        )}
        <Animated.View style={spin}>
          <MorphIcon
            size={size === "xs" ? 18 : 20}
            color={color.color}
            icon={isLoading ? LoaderCircle : children}
          />
        </Animated.View>
      </Component>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.full,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.border.default,
  },
  elevatedSubtle: {
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
  elevated: {
    boxShadow: [
      {
        offsetX: -2,
        offsetY: 2,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.2)",
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
  },
  neutralSubtle: {
    backgroundColor: colors.surface.elevatedSubtle,
    color: colors.muted,
  },
  neutralInverted: {
    backgroundColor: colors.neutral.muted,
    color: colors.background
  },
  /** Destructive, and the only place in the app that fills a control with it. */
  danger: {
    backgroundColor: colors.danger.base,
    color: colors.danger.foreground,
  }
})
