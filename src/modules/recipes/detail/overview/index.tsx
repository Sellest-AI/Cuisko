import { View, StyleSheet, useWindowDimensions } from "react-native";

import { Avatar } from "@ui/avatar";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { difficultyKey } from "@shared/recipes";

import { NutritionCard } from "../../_components/nutrition-card";
import { RecipeScreen } from "../../_components/recipe-screen";
import { columnWidth, SCREEN_PADDING } from "../../constants";
import { useRecipe } from "../../_hooks/useRecipe";
import { EQUIPMENT_EMOJI, EQUIPMENT_IMAGE } from "~/lib/vocabulary";
import { Difficulty } from "./difficulty";
import { GroceryRow } from "./grocery-row";
import { Timings, type Timing } from "./timings";
import { IngredientGroup } from "../../_components/ingredient-group";

/**
 * The face beside the chef's name, until a cook can have one of their own.
 *
 * `users` carries an `image` from the auth provider, but nothing uploads or resolves one yet, so
 * every recipe would draw a blank circle. Unlike the name below it, this does not degrade into
 * something honest — an absent avatar is a hole in the tile — so it stands in unconditionally.
 */
const PLACEHOLDER_AVATAR = require("assets/placeholders/empty-placeholder.webp");

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
    { emoji: "🕑", minutes: recipe.minutes, label: t("Overview.total") },
    { emoji: "🍪", minutes: recipe.timings.preparation, label: t("Overview.preparation") },
    { emoji: "🔥", minutes: recipe.timings.cooking, label: t("Overview.cooking") },
    { emoji: "😴", minutes: recipe.timings.resting, label: t("Overview.resting") },
  ]
    .filter((timing) => timing.minutes !== undefined)
    .map(({ emoji, label, minutes }) => ({
      emoji,
      label,
      value: t("Overview.minutes", { count: minutes! }),
    }));

  return (
    <RecipeScreen>
      <View style={styles.facts}>
        <View style={styles.credits}>
          <View style={[styles.tile, styles.difficulty]}>
            <Difficulty
              label={t(`Difficulties.${difficultyKey(recipe.difficulty)}`)}
              level={recipe.difficulty}
            />
          </View>
          <View style={[styles.tile, styles.chef]}>
            <Avatar source={PLACEHOLDER_AVATAR} />
            <View style={styles.chefName}>
              {/*
                * An unnamed owner is credited generically rather than left blank: the tile is
                * labelled "Chef", and a label over an empty line reads as the page having failed.
                */}
              <Text.Base numberOfLines={1} color={theme.colors.neutral.base}>
                {recipe.chef?.name ?? t("Overview.unknown_chef")}
              </Text.Base>
              <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>{t("Overview.chef")}</Text.Sm>
            </View>
          </View>
        </View>
        {/*
          * Per serving here, because this tab has no servings stepper — the figure has to stand on
          * its own. The ingredients tab shows the batch instead, and both cards say which they are.
          * Absent entirely when a line could not be weighed: `totalsOf` refuses a partial total.
          */}
        {recipe.nutrition && (
          <NutritionCard
            scope={t("Nutrition.per_serving")}
            protein={recipe.nutrition.perServing.protein}
            carbs={recipe.nutrition.perServing.carbohydrates}
            fat={recipe.nutrition.perServing.fat}
            calories={recipe.nutrition.perServing.calories}
          />
        )}
        {timings.length > 0 && (
          <View style={[styles.tile, { paddingHorizontal: 0 }]}>
            <Timings
              style={{ paddingHorizontal: styles.tile.padding }}
              timings={timings}
            />
          </View>
        )}
      </View>
      {recipe.equipments.length > 0 && (
        <View style={styles.section}>
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
    </RecipeScreen>
  );
};

const styles = StyleSheet.create({
  facts: {
    marginTop: theme.spacing[4],
    paddingHorizontal: SCREEN_PADDING,
    gap: theme.spacing[8],
  },
  credits: {
    flexDirection: "row",
    gap: theme.spacing[8],
  },
  tile: {
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.spacing[16],
    minHeight: 72,
    justifyContent: "center",
  },
  chef: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[12],
  },
  chefName: { flexShrink: 1 },
  /** Room on the right so the gauge's five bars never sit flush against the tile's border. */
  difficulty: { paddingRight: theme.spacing[24] },
  section: { marginTop: theme.spacing[28] },
});
