import { View, StyleSheet, ViewStyle } from "react-native";
import { Text } from "@ui/text";
import { Icon, MorphIcon } from "./icons";
import { theme } from "theme";

type Props = {
  style?: ViewStyle,
  title: string,
  icon: Icon,
  children: string,
  variant: "warning"
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
  }
})
