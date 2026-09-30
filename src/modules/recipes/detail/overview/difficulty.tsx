import { View, StyleSheet } from "react-native";

import { BentoCard } from "@ui/cards/bento";
import { Text } from "@ui/text";
import { theme } from "theme";
import { DIFFICULTIES } from "@shared/recipes";

type Props = {
  /**
   * The recipe's difficulty, from 1 to `DIFFICULTIES.length`, scaled onto however many bars
   * `BAR_HEIGHTS` draws.
   */
  level: number;
  label: string;
};

/**
 * The difficulty gauge — a small bar chart rather than a word alone, so the rating reads as a
 * position on a scale before it is read at all.
 */
export const Difficulty = ({ level, label }: Props) => {
  const barLevel = Math.round((level / DIFFICULTIES.length) * BAR_HEIGHTS.length);

  return (
    <BentoCard style={styles.difficulty}>
      <View style={styles.bars}>
        {BAR_HEIGHTS.map((height, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              { height, backgroundColor: index < barLevel ? theme.colors.primary.base : theme.colors.neutral.foreground },
            ]}
          />
        ))}
      </View>
      <Text.Base numberOfLines={1} color={theme.colors.neutral.muted}>{label}</Text.Base>
    </BentoCard>
  );
};

/** Uneven on purpose: a flat row of bars reads as a progress bar, not as a rating. */
const BAR_HEIGHTS = [34, 30, 34, 32, 34, 30, 28];

const styles = StyleSheet.create({
  difficulty: {
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[16],
    paddingHorizontal: theme.spacing[20],
  },
  bars: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});
