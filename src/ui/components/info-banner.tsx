import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Text } from "@ui/text";
import { Icon, MorphIcon } from "./icons";
import { theme } from "theme";

type Props = {
  style?: StyleProp<ViewStyle>,
  title: string,
  icon: Icon,
  children: string,
  /**
   * What the banner is for, not what it looks like: `warning` is something to be careful about,
   * `secondary` something about to happen that the user is expected to welcome, `tip` advice they
   * are free to take or leave, `neutral` context that asks nothing of the user.
   */
  variant: "warning" | "secondary" | "tip" | "neutral"
}

export const InfoBanner = ({ variant, style, title, icon, children }: Props) => {
  const colors = styles[variant];

  return (
    <View style={[styles.container, colors, style]}>
      <MorphIcon
        icon={icon}
        size={20}
        color={colors.color}
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <View style={styles.content}>
        <Text.Base color={colors.color} style={{ fontWeight: 600 }}>
          {title}
        </Text.Base>
        <Text.Sm
          style={{
            flexShrink: 1,
            color: colors.color,
            lineHeight: theme.font.sm.lineHeight * 1.1
          }}
        >
          {children}
        </Text.Sm>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[12],
    padding: theme.spacing[16],
    borderRadius: theme.radius.lg,
    borderStyle: "dashed",
    borderWidth: 2,
  },
  content: {
    gap: theme.spacing[4],
    flexShrink: 1,
  },
  warning: {
    borderColor: theme.colors.danger.elevated,
    backgroundColor: theme.colors.danger.subtle,
    color: theme.colors.danger.base,
  },
  secondary: {
    borderColor: theme.colors.secondary.elevated,
    backgroundColor: theme.colors.secondary.subtle,
    color: theme.colors.secondary.base,
  },
  tip: {
    borderColor: theme.colors.primary.elevated,
    backgroundColor: theme.colors.primary.subtle,
    color: theme.colors.primary.base,
  },
  neutral: {
    borderColor: theme.colors.neutral.elevated,
    backgroundColor: theme.colors.neutral.subtle,
    color: theme.colors.neutral.muted,
  }
})
