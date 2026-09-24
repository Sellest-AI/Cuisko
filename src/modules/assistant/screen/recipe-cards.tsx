import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { CardRecipe } from "@ui/cards/recipe";
import { theme } from "theme";

import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";

import { useAssistantRecipes } from "../_hooks/useAssistantRecipes";
import type { DisplayLayout } from "../_model/displayLayout";

/** Wide enough to read a title on a phone, narrow enough that a second card is clearly there. */
const SHELF_CARD_WIDTH = 220;

type Props = {
  /** The recipes Cuisko chose to show, in its order. */
  recipeIds: string[];
  layout: DisplayLayout;
};

/**
 * The recipes one answer shows: a single card the width of the answer, or a shelf.
 *
 * **It renders nothing at all rather than an empty state.** A card is an addition to an answer,
 * never a section of the screen. The same applies while the query is in flight: a skeleton that
 * appears after the answer has already been read is a flicker, not feedback.
 *
 * The shelf scrolls past the sheet's gutter on both edges, the way the home shelf does, so a third
 * card is visibly there to be reached rather than cut off at the margin.
 */
export const RecipeCards = ({ recipeIds, layout }: Props) => {
  const tVocabulary = useTranslations("Vocabulary");
  const { recipes } = useAssistantRecipes(recipeIds);

  if (recipes.length === 0) return null;

  const cards = recipes.map((recipe) => (
    <CardRecipe
      key={recipe.id}
      title={recipe.title}
      subtitle={tVocabulary(`Cuisines.${recipe.cuisine}`)}
      imageSrc={recipe.coverImageUrl ? { uri: recipe.coverImageUrl } : COVER_PLACEHOLDER}
      style={layout === "shelf" ? { width: SHELF_CARD_WIDTH } : undefined}
      onPress={() => router.push(`/recipe/${recipe.id}`)}
    />
  ));

  if (layout === "single") return <View style={styles.single}>{cards}</View>;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.shelf}
      contentContainerStyle={styles.shelfCards}
    >
      {cards}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  single: {
    paddingVertical: theme.spacing[8],
    paddingBottom: theme.spacing[16],
  },
  /** Pulls the shelf out of the message's own left inset so it runs edge to edge. */
  shelf: {
    marginHorizontal: -theme.spacing[32],
  },
  shelfCards: {
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[28],
    paddingBottom: theme.spacing[16],
  },
});
