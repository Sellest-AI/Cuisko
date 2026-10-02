import { StyleSheet, View, type ViewStyle } from "react-native";

import { theme } from "theme";

const BAR_WIDTH = 5;
/** A bar never shrinks below this share of the row, so a poor score still reads as a bar. */
const MIN_HEIGHT_SHARE = 0.2;

/** From the worst score to the best: each step's lower bound, and the colour it takes. */
const SCORE_STEPS: readonly { from: number; color: string }[] = [
  { from: 90, color: theme.colors.success.base },
  { from: 65, color: theme.colors.success.elevated },
  { from: 40, color: theme.colors.danger.subtle },
  { from: 30, color: theme.colors.danger.elevated },
  { from: 0, color: theme.colors.danger.base },
];

/** The colour a 0–100 score takes, from danger at the bottom to success at the top. */
export const scoreColor = (score: number) =>
  SCORE_STEPS.find((step) => score >= step.from)?.color ?? theme.colors.danger.elevated;

type Props = {
  /** 0–100 each, in the order they are drawn. */
  scores: number[];
  height?: number;
  style?: ViewStyle;
};

/** A row of bars, one per score: the lower the score, the shorter and the redder its bar. */
export const ScoreBars = ({ scores, height = 40, style }: Props) => (
  <View style={[styles.row, { height }, style]}>
    {scores.map((score, index) => {
      const share = MIN_HEIGHT_SHARE + (1 - MIN_HEIGHT_SHARE) * (Math.min(Math.max(score, 0), 100) / 100);

      return (
        // The same score can repeat, and the row is redrawn whole: the position is the identity.
        <View key={index} style={[styles.bar, { height: height * share, backgroundColor: scoreColor(score) }]} />
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing[6] },
  bar: { width: BAR_WIDTH, borderRadius: theme.radius.full },
});
