import { View, StyleSheet, ViewProps } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { theme } from "theme";
import { Text, TextNative } from "../text";
import { HeartIcon } from "../icons";
import { BentoCard } from "./bento";

const RING_SIZE = 64;
const RING_WIDTH = 6;
/** Inset by half the stroke, so the ring's outer edge meets the canvas edge instead of being cut. */
const RING_RADIUS = (RING_SIZE - RING_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
  const filled = Math.min(Math.max(score, 0), 100) / 100;

  const hasScore = score >= 0;

  return (
    <BentoCard style={[styles.container, style]}>
      <View>
        <Text.Base style={styles.label}>{label}</Text.Base>
        <TextNative style={styles.score}>
          {hasScore ? score : "??"}
        </TextNative>
      </View>
      <View style={styles.ring}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={hasScore ? theme.colors.neutral.subtle : theme.colors.neutral.elevated}
            strokeWidth={RING_WIDTH}
          />
          {/* Rotated a quarter turn back, so the fill starts at twelve o'clock and runs clockwise. */}
          {filled > 0 && (
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={theme.colors.success.subtle}
              strokeWidth={RING_WIDTH}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled)}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          )}
        </Svg>
        <HeartIcon
          color={hasScore ? theme.colors.success.base : theme.colors.neutral.elevated}
          fill={hasScore ? theme.colors.success.base : theme.colors.neutral.elevated}
          size={20}
        />
      </View>
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
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: "center",
    alignItems: "center",
  }
})
