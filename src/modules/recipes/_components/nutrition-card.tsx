import { View, StyleSheet, ViewStyle } from "react-native";

import { SparklesIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { Stat } from "./nutrition-card.stat";

type Props = {
  /** Grams, unrounded. Absent when the catalog could not weigh every line of the recipe. */
  protein?: number;
  fat?: number;
  carbs?: number;
  /** Kilocalories, unrounded. */
  calories?: number;
  /**
   * What the four figures are measured over — "Per serving", "For 4 people".
   *
   * Required, and that is the point: the same card is drawn on two screens over two different
   * quantities, and the numbers alone cannot say which. Without this a cook reading 300 kcal on one
   * tab and 1200 on the next has no way to tell that both are right.
   */
  scope: string;
  style?: ViewStyle;
};

/**
 * The macro breakdown, carrying its own "AI Generated" mark.
 *
 * The mark is part of the card rather than a caller's decision: these numbers are inferred from the
 * ingredients, never measured, and a screen that dropped the label would be claiming otherwise.
 */
export const NutritionCard = ({ protein, fat, carbs, calories, scope, style }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={[styles.card, style]}>
      <View style={styles.heading}>
        <View style={styles.title}>
          <Text.Lg>{t("Nutrition.title")}</Text.Lg>
          <Text.Sm color={theme.colors.neutral.muted}>{scope}</Text.Sm>
        </View>
        <View style={styles.credit}>
          <SparklesIcon size={12} color={theme.colors.primary.base} />
          <Text.Sm color={theme.colors.primary.base}>{t("Nutrition.estimated")}</Text.Sm>
        </View>
      </View>
      <View style={styles.stats}>
        {protein !== undefined && <Stat label={t("Nutrition.protein")} value={`🍗 ${_grams(protein)}`} />}
        {fat !== undefined && <Stat label={t("Nutrition.fat")} value={`🥑 ${_grams(fat)}`} />}
        {carbs !== undefined && <Stat label={t("Nutrition.carbs")} value={`🧅 ${_grams(carbs)}`} />}
        {calories !== undefined && <Stat label={t("Nutrition.calories")} value={`🔥 ${_kcal(calories)}`} />}
      </View>
    </View>
  );
};

/**
 * Whole numbers, with the unit attached.
 *
 * The macros arrive as a sum over per-100g figures, so they carry a dozen decimal places that mean
 * nothing — the catalog's own numbers are rounded to begin with. The unit is not optional: "50" in
 * a box labelled "Protein" is the one reading a cook cannot check against anything.
 */
const _grams = (value: number) => `${Math.round(value)} g`;
const _kcal = (value: number) => `${Math.round(value)} kcal`;

const styles = StyleSheet.create({
  title: { gap: 2 },
  card: {
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.spacing[16],
    gap: theme.spacing[12],
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  credit: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing[2],
  },
});
