import { StyleSheet, ViewStyle } from "react-native";
import { theme } from "theme";
import { IconComponent } from "./icons";
import { Text } from "./text";
import { BlurView } from "./blur-view";

type Variant = "neutral" | "warning" | "success" | "subtle";

type Props = {
  style?: ViewStyle | ViewStyle[],
  icon?: IconComponent,
  children: string
  variant?: Variant
  /**
   * Overrides the variant's own text and icon colour, for a badge sitting on a ground the variant
   * was not picked against — a neutral pill on a dark tile, say.
   *
   * A prop of its own rather than a `color` smuggled through `style`: `color` is not a `View`
   * style, so React Native would never apply it, and reading it back out of the style object made
   * every call site look like it was setting something the container understood.
   */
  textColor?: string
}

/**
 * What each variant writes in. Kept out of `styles` because `color` is a text style and these are
 * view entries — inside `StyleSheet.create` it reads as something that paints, and it never does.
 */
const TEXT_COLORS: Record<Variant, string> = {
  neutral: theme.colors.neutral.muted,
  warning: theme.colors.primary.base,
  success: theme.colors.success.base,
  subtle: theme.colors.neutral.muted,
};

export const Badge = ({ style, icon, children, variant = "neutral", textColor }: Props) => {
  const Icon = icon;
  const surface = variant === "success" ? styles.success :
    variant === "warning" ? styles.warning :
      variant === "subtle" ? styles.subtle : styles.neutral;

  const foreground = textColor ?? TEXT_COLORS[variant];

  return (
    <BlurView style={[styles.container, surface, style]} tint="light">
      {Icon && <Icon size={12} color={foreground} />}
      <Text.Sm color={foreground} style={{ marginTop: -1 }}>
        {children}
      </Text.Sm>
    </BlurView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    overflow: "hidden",
    borderWidth: 2,
  },
  neutral: {
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
  },
  warning: {
    backgroundColor: theme.colors.primary.subtle,
    borderWidth: 0,
  },
  success: {
    backgroundColor: theme.colors.success.subtle,
    borderWidth: 0,
  },
  subtle: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderColor: theme.colors.neutral.elevated,
  }
})
