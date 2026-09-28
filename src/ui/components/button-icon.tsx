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
  /** The glyph alone, when the disc's own size is not the right scale for it. */
  iconSize?: number;
  style?: ViewStyle;
  disabled?: boolean;
  onPress?: () => void;
  /** Ticks on its own, like every long press: see `Pressable`. */
  onLongPress?: () => void;
  /** How long a press must be held to count as one, when `Pressable`'s default is too eager. */
  delayLongPress?: number;
  /** A tick on each tap — see `Pressable`'s `haptic`. */
  haptic?: boolean;
  /** Room around the disc that still counts as a tap, for a disc drawn smaller than a finger. */
  hitSlop?: number;
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
  onLongPress,
  delayLongPress,
  haptic,
  hitSlop,
  disabled,
  variant = "primary",
  composite = false,
  elevated = false,
  size = "md",
  isLoading = false,
  iconSize: iconSizeOverride,
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

  const defaultPadding =
    size === "xs" ? 8 :
      size === "sm" ? 10 :
        size === "md" ? 12 :
          size === "lg" ? 16 : 18;

  const iconSize = iconSizeOverride ?? (size === "xs" ? 18 : 20);

  const isBaseNeutral = variant.includes("neutral") && !variant.includes("inverted");

  const Component = isBaseNeutral ? BlurView : View;

  const elevation = variant === "neutral-inverted" ?
    styles.elevated : styles.elevatedSubtle;

  const borderWidth = variant === "neutral-inverted" ? 1 : 2;

  /**
   * Padding is the disc's, not the frame's, so it is pulled out of `style` here and applied only
   * below — spreading it onto the `Pressable` as well would apply a caller's padding twice.
   */
  const { padding: stylePadding, ...outerStyle } = StyleSheet.flatten(style || {});

  const basePadding = stylePadding ?? defaultPadding;
  /**
   * `BlurView` repaints the border in an overlay, so it costs no layout — a neutral disc came out
   * `borderWidth` smaller on every side than the same disc drawn on a `View`, and a `ButtonPill`
   * holding one shrank with it. The blurred branch pays that inset in padding instead.
   */
  const padding = isBaseNeutral && typeof basePadding === "number" ?
    basePadding + borderWidth : basePadding;

  const hasGradient = variant === "neutral-inverted" || (variant === "danger" && elevated);

  const pressIntensity = size === "xs" ? 0.95 :
    size === "sm" ? 0.97 : 0.93;

  return (
    <Pressable
      style={{
        pointerEvents: composite ? "none" : "auto",
        ...outerStyle
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      haptic={haptic}
      hitSlop={hitSlop}
      disabled={disabled || isLoading}
      animated={!composite}
      intensity={pressIntensity}
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
            size={iconSize}
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
    overflow: "hidden",
  },
  elevatedSubtle: {
    boxShadow: [
      {
        offsetX: 0,
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
        offsetX: 0,
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
