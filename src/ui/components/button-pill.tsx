import { ColorValue, LayoutChangeEvent, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme, colors } from "theme";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { ReactNode, useState } from "react";
import { Icon } from "./icons";
import { ButtonIcon } from "./button-icon";
import { BlurView } from "./blur-view";

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
  size?: "sm" | "md" | "lg";
};

/**
 * Icon *or* content per side, never both — two things in one slot is a layout bug rather than a
 * choice, and the `?: undefined` arm is what makes passing both a compile error.
 */
type LeftSide = {
  leftIcon?: Icon;
  onLeftPress?: () => void;
  leftContent?: undefined
} | {
  leftContent?: ReactNode | ((props: { color: string }) => ReactNode);
  onLeftPress?: undefined;
  leftIcon?: undefined
};

type RightSide = {
  rightIcon?: Icon;
  onRightPress?: () => void;
  rightContent?: undefined
} | {
  rightContent?: ReactNode | ((props: { color: string }) => ReactNode);
  onRightPress?: undefined;
  rightIcon?: undefined
};

/**
 * A pill-shaped button with icons or arbitrary content on either side.
 * This component must use a leftIcon or rightIcon.
 */
export const ButtonPill = ({
  children,
  onPress,
  onLeftPress,
  onRightPress,
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

  const defaultColor = variant === "primary" ? styles.primary :
    variant === "secondary" ? styles.secondary :
      styles.neutral;

  const flatStyle = StyleSheet.flatten(style || {}) || {};

  /**
   * The label colour can only come from `defaultColor`: `style` is a `ViewStyle`, which has no
   * `color`. Typed optional rather than asserted present, so a variant that ever ships without one
   * shows up here instead of silently rendering the label in the platform default.
   */
  const color = StyleSheet.flatten([defaultColor, flatStyle]) as {
    backgroundColor?: ColorValue;
    color?: ColorValue;
  };

  const borderColor = variant === "neutral" && !elevated ?
    colors.border.medium : colors.border.default;

  /**
   * The keys that describe the row inside the pill, pulled off the caller's style so they land
   * there and not on the outer pressable: padding, the gap between the parts, and where the parts
   * sit along the row. Everything else is the pill's box and goes outside.
   */
  const { paddingHorizontal, paddingVertical, gap: styleGap,
    paddingLeft: overridePaddingLeft, paddingRight: overridePaddingRight,
    padding: overridePadding, minHeight, justifyContent, ...rest } = flatStyle;

  const defaultPadding = size === "lg" ? theme.spacing[8] : theme.spacing[4];
  const padding = overridePadding ?? defaultPadding;

  const defaultPaddingRight = rightIcon ? padding : rightContent ? theme.spacing[16] :
    (size === "lg" ? theme.spacing[24] : theme.spacing[16]);
  const defaultPaddingLeft = leftIcon ? padding : leftContent ? theme.spacing[16] :
    (size === "lg" ? theme.spacing[24] : theme.spacing[16]);

  const paddingLeft = overridePaddingLeft ?? paddingHorizontal ?? defaultPaddingLeft;
  const paddingRight = overridePaddingRight ?? paddingHorizontal ?? defaultPaddingRight;

  const gap = styleGap ?? styles.base.gap;

  /**
   * The label is centred on the pill, not on the space left between its sides. Auto margins put
   * it in the middle of that space, which is off-centre whenever one side is wider than the other
   * (an icon on the left, nothing on the right). The narrower side is padded by the difference —
   * but only out of free space, so a pill that hugs its content never grows to balance itself.
   * A caller passing `justifyContent` has chosen its own layout and gets neither.
   */
  const [widths, setWidths] = useState({ row: 0, left: 0, label: 0, right: 0 });
  const measure = (part: keyof typeof widths) => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setWidths((current) => current[part] === width ? current : { ...current, [part]: width });
  };

  const hasLeft = Boolean(leftIcon || leftContent);
  const hasRight = Boolean(rightIcon || rightContent);
  const isCentred = justifyContent === undefined;

  let balanceLeft = 0;
  let balanceRight = 0;
  if (isCentred && typeof paddingLeft === "number" && typeof paddingRight === "number" && typeof gap === "number") {
    // A neutral pill is a BlurView, which moves its border onto a child and so does not inset by it.
    const borderInset = variant === "neutral" ? 0 : styles.base.borderWidth * 2;
    const leftExtent = paddingLeft + (hasLeft ? widths.left + gap : 0);
    const rightExtent = paddingRight + (hasRight ? widths.right + gap : 0);
    const freeSpace = widths.row - borderInset - leftExtent - rightExtent - widths.label;
    const balance = Math.min(Math.abs(leftExtent - rightExtent), Math.max(0, freeSpace));
    if (leftExtent < rightExtent) balanceLeft = balance;
    else balanceRight = balance;
  }

  const isDisabled = disabled || isLoading;
  const containerOpacity = isDisabled ? 0.5 : 1;
  const textOpacity = isDisabled ? 0.7 : 1;

  const ViewComponent = variant === "neutral" ? BlurView : View;

  return (
    <Pressable
      style={{
        ...styles.borderRadius,
        ...rest,
        opacity: containerOpacity,
      }}
      onPress={onPress}
      disabled={isDisabled}
    >
      <ViewComponent
        tint="light"
        onLayout={measure("row")}
        style={[
          styles.base,
          styles.borderRadius,
          { gap, borderColor },
          { padding, paddingLeft, paddingRight },
          { paddingHorizontal, paddingVertical, minHeight },
          (balanceLeft > 0 || balanceRight > 0) && {
            paddingLeft: (paddingLeft as number) + balanceLeft,
            paddingRight: (paddingRight as number) + balanceRight,
          },
          { justifyContent: justifyContent ?? styles.base.justifyContent },
          elevated && styles.elevated,
          color,
        ]}>
        {elevated && <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: -10 }}
          style={[styles.absolute, styles.borderRadius]}
        />}
        {hasLeft && <View style={styles.side} onLayout={measure("left")}>
          {leftIcon ? <ButtonIcon
            variant={elevated ? `${variant}-subtle` : variant}
            elevated={true}
            composite={!onLeftPress}
            size={size === "sm" ? "xs" : "sm"}
            isLoading={isLoading}
            onPress={onLeftPress}
          >
            {leftIcon}
          </ButtonIcon> : typeof leftContent === "function" ? leftContent({ color: color.color as string }) : leftContent}
        </View>}
        <View style={isCentred && styles.label} onLayout={measure("label")}>
          {typeof children === "string" ? (
            <Text.Base
              style={{
                color: color.color,
                fontWeight: 600,
                opacity: textOpacity,
                textAlign: "center",
              }}
            >
              {children}
            </Text.Base>
          ) : (children)}
        </View>
        {hasRight && <View style={styles.side} onLayout={measure("right")}>
          {rightIcon ? <ButtonIcon
            variant={elevated ? `${variant}-subtle` : variant}
            elevated={true}
            composite={!onRightPress}
            size={size === "sm" ? "xs" : "sm"}
            isLoading={isLoading}
            onPress={onRightPress}
          >
            {rightIcon}
          </ButtonIcon> : typeof rightContent === "function" ? rightContent({ color: color.color as string }) : rightContent}
        </View>}
      </ViewComponent>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    padding: theme.spacing[8],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[12],
    minHeight: 36,
    borderWidth: 2,
  },
  borderRadius: {
    borderRadius: theme.radius.full,
  },
  side: {
    position: "relative",
  },
  label: {
    marginHorizontal: "auto",
    flexShrink: 1,
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
