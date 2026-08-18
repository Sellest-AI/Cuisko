import { View, StyleSheet } from "react-native";

import { Avatar } from "@ui/avatar";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NutritionCard } from "./_components/nutrition-card";
import { RecipeScreen } from "./_components/recipe-screen";
import { SCREEN_PADDING } from "./constants";
import { Difficulty } from "./overview-screen.difficulty";
import { GroceryRow } from "./overview-screen.grocery-row";
import { Timings } from "./overview-screen.timings";

/** Placeholder recipe, until `_hooks/` exists to fetch a real one. */
const RECIPE = {
  difficulty: { level: 2, label: "Beginner" },
  chef: { name: "Franck Desfrançais", avatar: require("assets/placeholders/pizza-recipe.jpg") },
  timings: [
    { emoji: "🍪", label: "Prep", value: "10 mins" },
    { emoji: "🔥", label: "Cook", value: "5 mins" },
    { emoji: "🕑", label: "Total", value: "15 mins" },
  ],
  nutrition: { protein: "50g", fat: "30g", carbs: "40g", calories: "300" },
  utensils: [
    { emoji: "🍳", name: "Frying Pan" },
    { emoji: "🧂", name: "Pepper" },
    { emoji: "🔥", name: "Oven" },
    { emoji: "🥄", name: "Spoon" },
    { emoji: "🧂", name: "Salt" },
  ],
  ingredients: [
    { emoji: "🍅", name: "Tomato" },
    { emoji: "🧅", name: "Onion" },
    { emoji: "🧄", name: "Garlic" },
    { emoji: "🫑", name: "Bell Pepper" },
    { emoji: "🫛", name: "Lentils" },
  ],
  servings: 2,
};

/** Everything about the recipe that is not a list of things to buy or a list of things to do. */
export const OverviewScreen = () => {
  const t = useTranslations("Recipe");

  return (
    <RecipeScreen>
      <View style={styles.facts}>
        <View style={styles.credits}>
          <View style={styles.tile}>
            <Difficulty level={RECIPE.difficulty.level} label={RECIPE.difficulty.label} />
          </View>
          <View style={[styles.tile, styles.chef]}>
            <Avatar source={RECIPE.chef.avatar} />
            <View style={styles.chefName}>
              <Text.Base numberOfLines={1} color={theme.colors.neutral.base}>{RECIPE.chef.name}</Text.Base>
              <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>{t("Overview.chef")}</Text.Sm>
            </View>
          </View>
        </View>
        <View style={styles.tile}>
          <Timings timings={RECIPE.timings} />
        </View>
        <NutritionCard {...RECIPE.nutrition} />
      </View>
      <View style={styles.section}>
        <GroceryRow title={t("Overview.utensils")} items={RECIPE.utensils} />
      </View>
      <View style={styles.section}>
        <GroceryRow
          title={t("Overview.ingredients")}
          items={RECIPE.ingredients}
        />
      </View>
    </RecipeScreen>
  );
};

const styles = StyleSheet.create({
  facts: {
    marginTop: theme.spacing[8],
    paddingHorizontal: SCREEN_PADDING,
    gap: theme.spacing[8],
  },
  credits: {
    flexDirection: "row",
    gap: theme.spacing[8],
  },
  tile: {
    backgroundColor: theme.colors.primary.subtle,
    padding: theme.spacing[16],
    borderRadius: theme.radius.md,
    minHeight: 72,
    justifyContent: "center",
  },
  chef: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  chefName: { flexShrink: 1 },
  section: { marginTop: theme.spacing[28] },
});
