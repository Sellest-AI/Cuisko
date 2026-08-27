import { View, StyleSheet } from "react-native";

import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

type Props = {
  /** How many of the five bars are lit, from 1 (beginner) to `BAR_HEIGHTS.length`. */
  level: number;
  label: string;
};

/**
 * The difficulty gauge — a small bar chart rather than a word alone, so the rating reads as a
 * position on a scale before it is read at all.
 */
export const Difficulty = ({ level, label }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={styles.difficulty}>
      <View style={styles.bars}>
        {BAR_HEIGHTS.map((height, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              { height, backgroundColor: index < level ? theme.colors.primary.base : theme.colors.neutral.foreground },
            ]}
          />
        ))}
      </View>
      <View style={styles.caption}>
        <Text.Base numberOfLines={1} color={theme.colors.neutral.base}>{label}</Text.Base>
        <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>{t("Overview.difficulty")}</Text.Sm>
      </View>
    </View>
  );
};

/** Uneven on purpose: a flat row of five reads as a progress bar, not as a rating. */
const BAR_HEIGHTS = [34, 30, 34, 32, 34];

const styles = StyleSheet.create({
  difficulty: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
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
  caption: { flexShrink: 1 },
});
