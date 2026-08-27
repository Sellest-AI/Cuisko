import { View, StyleSheet, useWindowDimensions } from "react-native";

import { ActionRow } from "@ui/action-row";
import { ForkKnife, ListPlus } from "@ui/icons";
import { Image } from "@ui/image";
import { theme } from "theme";
import { useTranslations } from "translations";
import { formatQuantity } from "@shared/ingredients";

import { EmptyState } from "../_components/empty-state";
import { NutritionCard } from "../_components/nutrition-card";
import { RecipeScreen } from "../_components/recipe-screen";
import { columnWidth, SCREEN_PADDING } from "../constants";
import { IngredientGroup } from "../_components/ingredient-group";
import { Servings } from "../_components/servings";
import { useRecipe } from "../_hooks/useRecipe";
import { groupByCategory } from "../_model/detail";

/** What the recipe needs, scaled to the number of people it is being cooked for. */
export const IngredientsScreen = ({ id }: { id?: string }) => {
  const t = useTranslations("Recipe");
  const { width } = useWindowDimensions();

  /** Already scaled — the hook owns that, so no screen can draw a list for the wrong count. */
  const { recipe, ingredients, servings, setServings } = useRecipe(id);

  /** Three even columns inside the gutter, so a name has room to sit on one line. */
  const itemWidth = columnWidth(width, COLUMNS);

  /** The chrome owns both the wait and the refusal; this tab draws nothing until there is a recipe. */
  if (!recipe) return null;

  /**
   * A recipe can genuinely have no lines: the cook wrote a method and no ingredients, or every line
   * they wrote failed to match the catalog and was dropped on import. Without this the tab draws a
   * servings stepper and a nutrition card over nothing — controls for a list that is not there,
   * which reads as the page still loading rather than as a recipe missing its ingredients.
   */
  if (ingredients.length === 0) {
    return (
      <RecipeScreen style={styles.screen}>
        <EmptyState icon={ForkKnife} title={t("Ingredients.title")} body={t("Ingredients.empty")} />
      </RecipeScreen>
    );
  }

  const groups = groupByCategory(ingredients, MIN_GROUP_SIZE);

  return (
    <RecipeScreen style={styles.screen}>
      <Servings servings={servings} onChange={setServings} />
      {/*
        * The batch, not a portion — this is the one screen with a servings stepper on it, and the
        * quantities under this card are the scaled ones, so the macros beside them are too. The
        * hook has already scaled `total`; `scope` is what stops it being read as the overview's
        * per-serving figure.
        */}
      {recipe.nutrition && (
        <NutritionCard
          style={styles.nutrition}
          scope={t("Nutrition.for_people", { count: servings })}
          protein={recipe.nutrition.total.protein}
          carbs={recipe.nutrition.total.carbohydrates}
          fat={recipe.nutrition.total.fat}
          calories={recipe.nutrition.total.calories}
        />
      )}
      {groups.map((group) => (
        <View key={group.category} style={styles.group}>
          <IngredientGroup
            title={t(`Categories.${group.category}`)}
            items={group.lines.map((line) => ({
              emoji: line.emoji,
              name: line.name,
              quantity: formatQuantity(line.quantity, line.unit),
            }))}
            itemWidth={itemWidth}
          />
        </View>
      ))}
      <ActionRow
        variant="secondary"
        style={styles.action}
        onPress={() => null}
        content={t("Ingredients.add_to_list")}
        contentIcon={ListPlus}
        subtitle={t("Ingredients.add_to_list_subtitle")}
        leftContent={
          <View style={styles.actionArt}>
            <Image source={INGREDIENT_IMAGE} style={[styles.actionIngredient, styles.actionIngredientBack]} contentFit="contain" />
            <Image source={INGREDIENT_IMAGE} style={[styles.actionIngredient, styles.actionIngredientFront]} contentFit="contain" />
          </View>
        }
      />
    </RecipeScreen>
  );
};

/**
 * The smallest aisle worth a heading of its own.
 *
 * Three rather than one, because a recipe reaches into a dozen categories and takes a single thing
 * from most of them: at one, the page is a column of headings with a lone tile under each, which
 * is more labels than ingredients and harder to scan than no grouping at all. Two still reads that
 * way — a heading earns its line once there is a row under it. Anything smaller falls into "Other"
 * at the bottom, which is last in the vocabulary, so the odds and ends collect where a cook already
 * expects them.
 */
const MIN_GROUP_SIZE = 3;

const INGREDIENT_IMAGE = require("assets/placeholders/empty-plate.png");
const INGREDIENT_SIZE = 64;
const COLUMNS = 3;

const styles = StyleSheet.create({
  screen: { paddingHorizontal: SCREEN_PADDING },
  nutrition: { marginTop: theme.spacing[12], marginBottom: theme.spacing[8] },
  group: { marginTop: theme.spacing[16] },
  action: {
    alignSelf: "center",
    marginTop: 40,
    marginBottom: theme.spacing[16],
  },
  /** Two plates overlapping, so the row's left side reads as a pile rather than one icon. */
  actionArt: {
    width: INGREDIENT_SIZE + 12,
    aspectRatio: 1,
  },
  actionIngredient: {
    position: "absolute",
    width: INGREDIENT_SIZE,
    height: INGREDIENT_SIZE,
  },
  actionIngredientBack: { top: -12, left: 0 },
  actionIngredientFront: { bottom: -8, right: -6 },
});
