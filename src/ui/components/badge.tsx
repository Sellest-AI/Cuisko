import { StyleSheet, ViewStyle } from "react-native";
import { theme } from "theme";
import { BlurView } from "./blur-view";
import { IconComponent } from "./icons";
import { Text } from "./text";

type Props = {
  style?: ViewStyle | ViewStyle[],
  icon?: IconComponent,
  children: string
}

export const Badge = ({ style, icon, children }: Props) => {
  const Icon = icon;
  return (
    <BlurView style={[styles.container, style]}>
      {Icon && <Icon size={12} color={theme.colors.foreground} />}
      <Text.Sm color={theme.colors.foreground} style={{ marginTop: -1 }}>
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
    backgroundColor: theme.colors.surface.elevated,
    borderColor: theme.colors.border.default,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    borderWidth: 2
  }
})
