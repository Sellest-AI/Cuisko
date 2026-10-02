import { View, StyleSheet, ViewProps } from "react-native";
import { theme } from "theme";
import { Text, TextNative } from "../text";
import { HeartIcon } from "../icons";
import { ScoreRing } from "../score-ring";
import { BentoCard } from "./bento";

const RING_SIZE = 64;
const RING_WIDTH = 6;

type Props = {
  /**
   * Out of 100; the ring fills in proportion. Negative means the recipe has no score, which greys
   * the ring and the heart and shows a placeholder instead of a number.
   */
  score: number;
  label: string;
  style?: ViewProps["style"]
}

export const ScoreHorizontal = ({ score, label, style }: Props) => {
  const hasScore = score >= 0;

  return (
    <BentoCard style={[styles.container, style]}>
      <View>
        <Text.Base style={styles.label}>{label}</Text.Base>
        <TextNative style={styles.score}>
          {hasScore ? score : "??"}
        </TextNative>
      </View>
      <ScoreRing
        score={score}
        size={RING_SIZE}
        strokeWidth={RING_WIDTH}
        trackColor={hasScore ? theme.colors.neutral.subtle : theme.colors.neutral.elevated}
        fillColor={theme.colors.success.subtle}
      >
        <HeartIcon
          color={hasScore ? theme.colors.success.base : theme.colors.neutral.elevated}
          fill={hasScore ? theme.colors.success.base : theme.colors.neutral.elevated}
          size={20}
        />
      </ScoreRing>
    </BentoCard>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing[16],
    paddingHorizontal: theme.spacing[20],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[32],
  },
  label: {
    color: theme.colors.neutral.muted,
    marginBottom: theme.spacing[2]
  },
  score: {
    fontSize: 32,
    lineHeight: 40,
    color: theme.colors.neutral.base,
    fontFamily: theme.font.h4.fontFamily,
  },
})
