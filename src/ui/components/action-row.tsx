import { View, StyleSheet, ViewStyle } from "react-native"
import { Pressable } from "./pressable"
import { ButtonIcon } from "./button-icon"
import { Icon, MorphIcon } from "./icons"
import { colors, theme } from "theme"
import { LinearGradient } from "expo-linear-gradient"
import { Text } from "./text"
import { ReactNode } from "react"

type Props = {
  variant?: "primary" | "secondary" | "flat",
  onPress: () => void,
  content: string,
  contentIcon: Icon,
  subtitle?: string,
  style?: ViewStyle,
} & LeftContent

type LeftContent = {
  leftContent: ReactNode,
  leftIcon?: undefined,
  onLeftIconPress?: undefined,
} | {
  leftIcon: Icon,
  onLeftIconPress: () => void,
  leftContent?: undefined,
}

const VARIANT_COLORS = {
  primary: {
    variant: "primary-subtle",
    gradient: [colors.primary.base, colors.primary.elevated],
    content: colors.primary.foreground,
    subtle: colors.primary.subtle,
  },
  secondary: {
    variant: "secondary-subtle",
    gradient: [colors.secondary.base, colors.secondary.elevated],
    content: colors.secondary.foreground,
    subtle: colors.secondary.subtle,
  },
  flat: {
    variant: "neutral-subtle",
    gradient: [colors.neutral.subtle, colors.neutral.subtle],
    content: colors.neutral.base,
    subtle: colors.neutral.muted,
  }
} as const;


export const ActionRow = ({
  variant = "primary",
  onPress,
  onLeftIconPress,
  leftContent,
  leftIcon,
  content,
  contentIcon,
  subtitle,
  style,
}: Props) => {

  const color = VARIANT_COLORS[variant];

  const ContentIcon = contentIcon;

  return (
    <Pressable
      onPress={onPress}
      style={{
        ...styles.container,
        boxShadow: variant === "flat" ? undefined : styles.container.boxShadow,
        ...style,
      }}>
      <LinearGradient
        colors={color.gradient}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: -1 }}
        style={styles.gradient}
      />
      <View style={styles.border} />
      {leftIcon && <View style={styles.leftButton}>
        <ButtonIcon
          composite={false}
          onPress={onLeftIconPress}
          elevated
          variant={color.variant}
        >
          {leftIcon}
        </ButtonIcon>
      </View>}
      {leftContent && <View style={styles.leftContent}>
        {leftContent}
      </View>}
      <View style={[styles.rightContent, { alignItems: subtitle ? "flex-start" : "center" }]}>
        <MorphIcon color={color.subtle} icon={ContentIcon} />
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

/**
 * Off the spacing scale on purpose: these are layout dimensions of the row itself — the width of
 * its fixed left rail and the floor on its own width — not padding rhythm.
 */
const MIN_WIDTH = 320;
const RAIL_DIVIDER_WIDTH = 3;
const RAIL_GAP = 36;
const LEFT_CONTENT_GAP = 20;
const LEFT_CONTENT_MAX_HEIGHT = 74;

const styles = StyleSheet.create({
  container: {
    position: "relative",
    borderRadius: theme.radius.lg,
    paddingRight: theme.spacing[24],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    minWidth: MIN_WIDTH,
    maxWidth: "100%",
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 6,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  rightContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[12],
    flexShrink: 1,
  },
  leftButton: {
    padding: theme.spacing[16],
    borderRightWidth: RAIL_DIVIDER_WIDTH,
    borderRightColor: colors.border.default,
    marginRight: RAIL_GAP,
  },
  leftContent: {
    marginLeft: theme.spacing[16],
    marginRight: LEFT_CONTENT_GAP,
    maxHeight: LEFT_CONTENT_MAX_HEIGHT,
    justifyContent: "center",
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.lg,
  },
  border: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: colors.border.default,
  }
});
