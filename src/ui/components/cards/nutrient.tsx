import { StyleSheet, ViewStyle, Platform } from "react-native";
import { theme } from "theme";
import { Text, TextNative } from "../text";
import { BentoCard } from "./bento";

type Props = {
  style?: ViewStyle,
  label?: string,
  value: string,
  emoji: string,
}

export const NutrientCard = ({ style, label, value, emoji }: Props) => {
  return (
    <BentoCard style={[styles.container, style]}>
      <TextNative style={styles.emoji}>
        {emoji}
      </TextNative>
      <Text.Lg style={styles.quantity}>
        {value}
      </Text.Lg>
      {label && <Text.Sm style={styles.label} numberOfLines={1}>
        {label}
      </Text.Sm>}
    </BentoCard>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 86,
  },
  emoji: {
    fontSize: Platform.select({ default: 32, android: 28 }),
    lineHeight: 36,
    textAlign: "center",
  },
  quantity: {
    marginTop: 12,
    textAlign: "center",
  },
  label: {
    marginTop: 4,
    color: theme.colors.neutral.muted,
    textAlign: "center",
  }
})
