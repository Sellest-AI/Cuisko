import { View, StyleSheet, ViewStyle } from "react-native";

import { HorizontalScrollView } from "@ui/horizontal-scroll-view";
import { NutrientCard } from "@ui/cards/nutrient";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

type Props = {
  /** Grams, unrounded. Absent when the catalog could not weigh every line of the recipe. */
  protein?: number;
  fat?: number;
  carbs?: number;
  saturatedFat?: number;
  /** Milligrams, unrounded: the catalog's own unit for it. */
  iron?: number;
  /** Kilocalories, unrounded. */
  calories?: number;
  /**
   * What the figures are measured over — "Per serving", "For 4 people".
   *
   * Required, and that is the point: the same card is drawn on two screens over two different
   * quantities, and the numbers alone cannot say which. Without this a cook reading 300 kcal on one
   * tab and 1200 on the next has no way to tell that both are right.
   */
  scope: string;
  /** Which edge the scope line hugs. */
  scopePosition?: "left" | "right";
  style?: ViewStyle;
  /** The screen's gutter, applied inside the scroll so the first card lines up and the row still bleeds. */
  paddingHorizontal?: number;
};

/**
 * The recipe's nutrition as a row of cards, one per figure, under a line saying what they are
 * measured over. A figure the catalog could not total is left out rather than shown as zero.
 */
export const NutritionRow = ({ protein, fat, carbs, calories, scope, scopePosition = "right", saturatedFat, iron, style, paddingHorizontal }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={style}>
      <Text.Sm
        color={theme.colors.neutral.muted}
        style={{
          ...styles.scope,
          paddingRight: scopePosition === "left" ? 0 : (paddingHorizontal ?? 0) + theme.spacing[2],
          paddingLeft: scopePosition === "right" ? 0 : (paddingHorizontal ?? 0) + theme.spacing[2],
          alignSelf: scopePosition === "right" ? "flex-end" : "flex-start",
        }}>
        {scope}
      </Text.Sm>
      <HorizontalScrollView contentContainerStyle={[styles.stats, { paddingHorizontal }]}>
        {protein !== undefined && <NutrientCard style={styles.card} label={t("Nutrition.protein")} emoji={"🍗"} value={_grams(protein)} />}
        {fat !== undefined && <NutrientCard style={styles.card} label={t("Nutrition.fat")} emoji={"🥑"} value={_grams(fat)} />}
        {calories !== undefined && <NutrientCard style={styles.card} label={t("Nutrition.calories")} emoji={"🔥"} value={_kcal(calories)} />}
        {saturatedFat !== undefined && <NutrientCard style={styles.card} label={t("Nutrition.saturated_fat")} emoji={"🥓"} value={_grams(saturatedFat)} />}
        {carbs !== undefined && <NutrientCard style={styles.card} label={t("Nutrition.carbs")} emoji={"🧅"} value={_grams(carbs)} />}
        {iron !== undefined && <NutrientCard style={styles.card} label={t("Nutrition.iron")} emoji={"🔩"} value={_milligrams(iron)} />}
      </HorizontalScrollView>
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
const _grams = (value: number) => `${Math.round(value)}g`;
const _kcal = (value: number) => `${Math.round(value)}`;
/** One decimal, not a whole number: a serving holds a few milligrams, and rounding 1.4 to 1 is a third off. */
const _milligrams = (value: number) => `${Math.round(value * 10) / 10}mg`;

const styles = StyleSheet.create({
  scope: {
    marginBottom: theme.spacing[8],
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[8],
  },
  card: {
    maxWidth: 106
  }
});
