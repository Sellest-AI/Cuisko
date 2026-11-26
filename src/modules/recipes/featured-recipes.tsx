import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { durationTextOf } from "@shared/recipes";
import { theme } from "theme";
import { useTranslations } from "translations";

import { RecipeShelf } from "./_components/recipe-shelf";
import { useExploreRecipes } from "./_hooks/useExploreRecipes";

type Props = {
  style?: StyleProp<ViewStyle>;
};

/** A row's worth: the first seven of the day's featured, the rest is the Explore page's. */
const COUNT = 7;

/**
 * The catalog's featured recipes as a row, for home to place: the first ones of the Explore page's
 * "Featured" grid, in the same order, from the same query.
 *
 * The one recipe row on home a guest sees: the week's ideas and the favorites need an account, the
 * catalog does not (`getCatalog.anon`). At the module root, on the same footing as
 * `favorite-recipes`, and drawn by the same shelf.
 *
 * Nothing to show, no section, the rule `home/spotlight` follows.
 */
export const FeaturedRecipes = ({ style }: Props) => {
  const t = useTranslations("Recipes");
  const tCommon = useTranslations("Common");
  const { recipes } = useExploreRecipes(undefined);

  if (recipes.length === 0) return null;

  return (
    <RecipeShelf
      title={t("Explore.featured")}
      recipes={recipes.slice(0, COUNT).map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        // `||`, not `??`: no time stated is "", which must not reach the card as a string to draw.
        subtitle: durationTextOf(recipe.minutes, tCommon("minute_unit")) || undefined,
        coverImageUrl: recipe.coverImageUrl,
      }))}
      style={[styles.gutter, style]}
    />
  );
};

const styles = StyleSheet.create({
  /** The shelf bleeds past a page gutter it assumes is there; home has none, so it is applied here. */
  gutter: { paddingHorizontal: theme.spacing[16] },
});
