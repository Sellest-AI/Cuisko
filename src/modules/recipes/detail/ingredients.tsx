import { useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";

import { ActionRow } from "@ui/action-row";
import { ListPlus } from "@ui/icons";
import { Image } from "@ui/image";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NutritionCard } from "../_components/nutrition-card";
import { RecipeScreen } from "../_components/recipe-screen";
import { columnWidth, SCREEN_PADDING } from "../constants";
import { IngredientGroup } from "../_components/ingredient-group";
import { Servings } from "../_components/servings";

/** Placeholder recipe, until `_hooks/` exists to fetch a real one. */
const RECIPE = {
  servings: 5,
  nutrition: { protein: "50g", fat: "30g", carbs: "40g", calories: "300" },
  groups: [
    {
      title: "Vegetables",
      items: [
        { emoji: "🥦", name: "Broccoli", quantity: "1 pcs (300g)" },
        { emoji: "🧅", name: "Onion", quantity: "1 pcs (150g)" },
        { emoji: "🥕", name: "Carrot", quantity: "1 pcs (200g)" },
        { emoji: "🫑", name: "Bell Pepper", quantity: "1 pcs (500g)" },
        { emoji: "🍄", name: "Mushroom", quantity: "100g" },
      ],
    },
    {
      title: "Other",
      items: [
        { emoji: "🧂", name: "Salt", quantity: "1 tsp" },
        { emoji: "🧄", name: "Garlic", quantity: "2 cloves" },
      ],
    },
  ],
};

/** What the recipe needs, scaled to the number of people it is being cooked for. */
export const IngredientsScreen = () => {
  const t = useTranslations("Recipe");
  const { width } = useWindowDimensions();
  const [servings, setServings] = useState(RECIPE.servings);

  /** Three even columns inside the gutter, so a name has room to sit on one line. */
  const itemWidth = columnWidth(width, COLUMNS);

  return (
    <RecipeScreen style={styles.screen}>
      <Servings servings={servings} onChange={setServings} />
      <NutritionCard {...RECIPE.nutrition} style={styles.nutrition} />
      {RECIPE.groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <IngredientGroup title={group.title} items={group.items} itemWidth={itemWidth} />
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
