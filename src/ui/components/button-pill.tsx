import { ColorValue, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme, colors } from "theme";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { ReactNode } from "react";
import { Icon } from "./icons";
import { ButtonIcon } from "./button-icon";

/**
 * Structural props only — a label and a callback. This component has no idea what it submits,
 * which is exactly why `src/ui/` never needs to import the backend (ADR 0002).
 *
 * A side takes *either* an icon or arbitrary content: `leftIcon` renders as a tinted `ButtonIcon`
 * disc, `leftContent` renders as-is. Both are optional on both sides — a pill with neither is a
 * plain text button, which is what `Button` composes.
 */
type Props = BaseProps & LeftSide & RightSide;

type BaseProps = {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "neutral";
  elevated?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: "md" | "lg";
};

/**
 * Icon *or* content per side, never both — two things in one slot is a layout bug rather than a
 * choice, and the `?: undefined` arm is what makes passing both a compile error.
 */
type LeftSide = { leftIcon?: Icon; leftContent?: undefined } | { leftContent?: ReactNode; leftIcon?: undefined };
type RightSide = { rightIcon?: Icon; rightContent?: undefined } | { rightContent?: ReactNode; rightIcon?: undefined };

/**
 * A pill-shaped button with icons or arbitrary content on either side.
 * This component must use a leftIcon or rightIcon.
 */
export const ButtonPill = ({
  children,
  onPress,
  variant = "primary",
  size = "md",
  elevated,
  isLoading = false,
  disabled = false,
  style,
  leftIcon,
  rightIcon,
  rightContent,
  leftContent,
}: Props) => {
  const gradient: readonly [ColorValue, ColorValue] = variant === "primary" ?
    [colors.primary.base, colors.primary.elevated] :
    variant === "secondary" ? [colors.secondary.base, colors.secondary.elevated] :
      ["transparent", "transparent"];

  const color = variant === "primary" ? styles.primary :
    variant === "secondary" ? styles.secondary :
      styles.neutral;

  const borderColor = variant === "neutral" && !elevated ?
    colors.border.medium : colors.border.default;

  const padding = size === "lg" ? theme.spacing.sm : theme.spacing.xs;
  const paddingRight = rightIcon ? padding : rightContent ? theme.spacing.lg :
    (size === "lg" ? theme.spacing.xl : theme.spacing.lg);
  const paddingLeft = leftIcon ? padding : leftContent ? theme.spacing.lg :
    (size === "lg" ? theme.spacing.xl : theme.spacing.lg);

  return (
    <Pressable
      style={{ alignSelf: "flex-start", ...style }}
      onPress={onPress}
      disabled={disabled || isLoading}
    >
      <View style={[
        styles.base,
        { padding, paddingLeft, paddingRight },
        elevated && styles.elevated,
        color
      ]}>
        {elevated && <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: -10 }}
          style={styles.absolute}
        />}
        <View
          style={{
            ...styles.absolute,
            borderWidth: 2,
            borderColor: borderColor,
            borderRadius: theme.radius.full,
          }}
        />
        {leftContent && <View style={{ position: "relative" }}>
          {leftContent}
        </View>}
        {leftIcon && <ButtonIcon
          variant={elevated ? `${variant}-subtle` : variant}
          elevated={true}
          composite
          size="sm"
          isLoading={isLoading}
        >
          {leftIcon}
        </ButtonIcon>}
        {typeof children === "string" ? (
          <Text.Base
            style={{
              color: color.color,
              fontWeight: 600,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {children}
          </Text.Base>
        ) : (children)}
        {rightIcon && <ButtonIcon
          variant={elevated ? `${variant}-subtle` : variant}
          elevated={true}
          composite
          size="sm"
          isLoading={isLoading}
        >
          {rightIcon}
        </ButtonIcon>}
        {rightContent && <View style={{ position: "relative" }}>
          {rightContent}
        </View>}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    overflow: "hidden",
    minHeight: 36,
  },
  absolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.1)",
      },
    ],
  },
  primary: {
    backgroundColor: colors.primary.elevated,
    color: colors.primary.foreground,
  },
  secondary: {
    backgroundColor: colors.secondary.elevated,
    color: colors.secondary.foreground,
  },
  neutral: {
    backgroundColor: colors.surface.elevated,
    color: colors.neutral.muted,
  }
}
);
