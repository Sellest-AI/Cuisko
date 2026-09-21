import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { theme } from "theme";
import { useTranslations } from "translations";

import { FavoritesShelf } from "./_components/favorites-shelf";
import { useFavoriteRecipes } from "./_hooks/useFavoriteRecipes";

type Props = {
  style?: StyleProp<ViewStyle>;
};

/**
 * The cook's favorites as a row, for a page outside this module to place — home puts it last.
 *
 * At the module root because `home/` renders it, on the same footing as `planning/weekly-plan`:
 * it calls its own hook, so a consumer places the tag and inherits no data obligation. The
 * recipes page does not use it — its shelf hides behind a search, and that decision belongs to
 * the screen that owns the search box, not to a section that cannot see one.
 *
 * Nothing to show, no section: loading and no favorites look the same, because a heading over an
 * empty row is a promise the page cannot keep — the rule `home/spotlight` already follows.
 */
export const FavoriteRecipes = ({ style }: Props) => {
  const t = useTranslations("Recipes");
  /** A cuisine is a shared vocabulary, so its words live with the rest of them. */
  const tVocabulary = useTranslations("Vocabulary");
  const { favorites } = useFavoriteRecipes();

  if (favorites.length === 0) return null;

  return (
    <FavoritesShelf
      title={t("favorites")}
      recipes={favorites.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        subtitle: tVocabulary(`Cuisines.${recipe.cuisine}`),
        coverImageUrl: recipe.coverImageUrl,
      }))}
      style={[styles.gutter, style]}
    />
  );
};

const styles = StyleSheet.create({
  /**
   * The shelf bleeds past a page gutter it assumes is there. Home's page has none — each section
   * pads its own rows — so this one is applied here, and the bleed nets out to edge to edge.
   */
  gutter: { paddingHorizontal: theme.spacing[16] },
});
