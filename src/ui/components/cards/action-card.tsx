import { View, StyleSheet, ViewProps } from "react-native";
import { theme } from "theme";
import { Text } from "../text";
import { Icon, MorphIcon, Plus } from "../icons";
import { ButtonIcon } from "../button-icon";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "../pressable";

type Props = {
  style?: ViewProps["style"],
  content: string,
  subtitle?: string,
  icon: Icon;
  onIconPress?: () => void;
  onPress?: () => void;
  variant?: "secondary" | "neutral";
}

const COLORS = {
  secondary: {
    background: { from: theme.colors.secondary.base, to: theme.colors.secondary.subtle },
    content: theme.colors.secondary.foreground,
    subtle: theme.colors.secondary.subtle,
    icon: theme.colors.secondary.subtle,
    borderColor: theme.colors.border.default,
    variant: "secondary-subtle" as const,
  },
  neutral: {
    background: theme.colors.neutral.subtle,
    content: theme.colors.neutral.base,
    subtle: theme.colors.neutral.muted,
    icon: theme.colors.neutral.subtle,
    borderColor: theme.colors.border.dark,
    variant: "neutral-subtle" as const,
  }
} as const;

export const ActionCard = ({ style, content, subtitle, icon, variant = "neutral", onPress, onIconPress }: Props) => {
  const color = COLORS[variant];
  const baseBackground = typeof color.background === "string" ? color.background : color.background.from;

  return (
    <Pressable
      onPress={onPress}
      style={StyleSheet.flatten([
        styles.shared,
        { backgroundColor: baseBackground },
        style
      ])}>
      {typeof color.background === "object" && (
        <LinearGradient
          colors={[color.background.from, color.background.to]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 2.5, y: 1 }}
        />
      )}
      <View style={[styles.container, styles.shared, { borderColor: color.borderColor }]}>
        <View style={styles.header}>
          <MorphIcon color={color.subtle} icon={icon} />
          <ButtonIcon
            composite={false}
            /** The card navigates; its disc adds in place, and the tick is what says it took. */
            haptic
            onPress={onIconPress}
            elevated
            variant={color.variant}
          >
            {Plus}
          </ButtonIcon>
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text.Base
            color={color.content}
            numberOfLines={1}
          >
            {content}
          </Text.Base>
          {subtitle && <Text.Sm
            numberOfLines={1}
            style={{ marginTop: theme.spacing[2] }}
            color={color.subtle}
          >
            {subtitle}
          </Text.Sm>}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shared: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
  },
  container: {
    padding: theme.spacing[16],
    paddingRight: theme.spacing[12],
    paddingTop: theme.spacing[12],
    gap: theme.spacing[24],
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[32],
    paddingLeft: theme.spacing[4],
  },
})
