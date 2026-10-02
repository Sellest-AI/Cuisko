import { View, StyleSheet, useWindowDimensions } from "react-native";

import { theme } from "theme";
import { useTranslations } from "translations";
import { difficultyKey } from "@shared/recipes";
import { ScoreHorizontal } from "@ui/cards/score-horizontal";

import { NutritionRow } from "../../_components/nutrition-row";
import { RecipeScreen } from "../../_components/recipe-screen";
import { columnWidth, SCREEN_PADDING } from "../../constants";
import { useRecipe } from "../../_hooks/useRecipe";
import { EQUIPMENT_EMOJI, EQUIPMENT_IMAGE } from "~/lib/vocabulary";
import { Difficulty } from "./difficulty";
import { GroceryRow } from "./grocery-row";
import { Timings, type Timing } from "./timings";
import { IngredientGroup } from "../../_components/ingredient-group";

const COLUMNS = 3;

/** Everything about the recipe that is not a list of things to buy or a list of things to do. */
export const OverviewScreen = ({ id }: { id?: string }) => {
  const t = useTranslations("Recipe");
  /** The kitchen's words belong to the vocabulary, not to the page that happens to list them. */
  const tVocabulary = useTranslations("Vocabulary");
  const { recipe } = useRecipe(id);

  /** Three even columns inside the gutter, so a name has room to sit on one line. */
  const { width } = useWindowDimensions();
  const itemWidth = columnWidth(width, COLUMNS);

  /** The chrome owns both the wait and the refusal; this tab draws nothing until there is a recipe. */
  if (!recipe) return null;

  /**
   * Only the timings the recipe declares.
   *
   * Compared against `undefined` rather than tested for truth: a step that takes no resting time is
   * a recipe that did not fill the field in, but a `0` somebody did write is a fact, and truthiness
   * cannot tell those apart. `minutes` is the backend's own sum of the three, so a recipe that
   * declares one timing still shows a total — and the total never disagrees with the parts.
   */
  const timings: Timing[] = [
    { minutes: recipe.timings.preparation, label: t("Overview.preparation") },
    { minutes: recipe.timings.cooking, label: t("Overview.cooking") },
    { minutes: recipe.timings.resting, label: t("Overview.resting") },
    { minutes: recipe.minutes, label: t("Overview.total"), isTotal: true },
  ]
    .filter((timing) => timing.minutes !== undefined)
    .map(({ label, minutes, isTotal }) => ({ isTotal, label, value: t("Overview.minutes", { count: minutes! }) }));

  return (
    <RecipeScreen style={styles.screen}>
      {/*
      * Per serving here, because this tab has no servings stepper — the figure has to stand on
      * its own. The ingredients tab shows the batch instead, and both cards say which they are.
      * Absent entirely when a line could not be weighed: `totalsOf` refuses a partial total.
      */}
      {recipe.nutrition && (
        <NutritionRow
          style={styles.nutrition}
          paddingHorizontal={SCREEN_PADDING}
          scope={t("Nutrition.per_serving")}
          protein={recipe.nutrition.perServing.protein}
          carbs={recipe.nutrition.perServing.carbohydrates}
          fat={recipe.nutrition.perServing.fat}
          calories={recipe.nutrition.perServing.calories}
          iron={recipe.nutrition.perServing.iron}
          saturatedFat={recipe.nutrition.perServing.saturatedFat}
        />
      )}
      <View style={[styles.horizontalRow, styles.paddingHorizontal]}>
        <Difficulty
          label={t(`Difficulties.${difficultyKey(recipe.difficulty)}`)}
          level={recipe.difficulty}
        />
        <ScoreHorizontal
          label={t("Overview.meal_score")}
          score={recipe.nutrition?.cuiScore ?? -1}
          style={styles.score}
        />
      </View>
      {timings.length > 0 && (
        <View style={[styles.paddingHorizontal, styles.timings]}>
          <Timings timings={timings} total={recipe.minutes} />
        </View>
      )}
      {recipe.ingredients.length > 0 && (
        <View
          style={[styles.section, {
            marginBottom: theme.spacing[16],
            paddingHorizontal: SCREEN_PADDING
          }]}
        >
          {/*
            * The recipe's own quantities are not shown here, so this row is deliberately NOT the
            * scaled list the ingredients tab draws — it names what the dish contains, and a name
            * does not change with the servings.
            */}
          <IngredientGroup
            title={t("Overview.ingredients")}
            titleSize="lg"
            items={recipe.ingredients.map((ingredient) => ({
              emoji: ingredient.emoji,
              imageUrl: ingredient.imageUrl,
              name: ingredient.name,
            }))}
            itemWidth={itemWidth}
          />
        </View>
      )}
      {recipe.equipments.length > 0 && (
        <View style={[styles.section, styles.utensils]}>
          <GroceryRow
            title={t("Overview.utensils")}
            items={recipe.equipments.map((equipment) => ({
              emoji: EQUIPMENT_EMOJI[equipment],
              imageSrc: EQUIPMENT_IMAGE[equipment],
              name: tVocabulary(`Equipments.${equipment}`),
            }))}
          />
        </View>
      )}
    </RecipeScreen>
  );
};

const styles = StyleSheet.create({
  screen: { marginTop: -theme.spacing[6] },
  /** Takes the row's width left over by the difficulty card. */
  score: { flex: 1 },
  paddingHorizontal: {
    paddingHorizontal: SCREEN_PADDING,
  },
  horizontalRow: {
    flexDirection: "row",
    gap: theme.spacing[8],
  },
  nutrition: {
    marginBottom: theme.spacing[8]
  },
  timings: {
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
  section: { marginTop: theme.spacing[24] },
  utensils: { marginTop: theme.spacing[8] }
});
