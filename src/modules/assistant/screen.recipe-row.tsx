import { router } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { useTranslations } from "translations";

import { CardRecipe } from "@ui/cards/recipe";
import { theme } from "theme";

import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";

import { useAssistantRecipes } from "./_hooks/useAssistantRecipes";

/** Wide enough to read a title on a phone, narrow enough that a second card is clearly there. */
const CARD_WIDTH = 220;

type Props = {
  /** Ids the `searchRecipes` tool returned on this turn, already ranked and de-duplicated. */
  recipeIds: string[];
};

/**
 * The recipes one answer found, as a shelf under it.
 *
 * **It renders nothing at all rather than an empty state.** Most turns call no tool, and a row of
 * cards is an addition to an answer, never a section of the screen — an "no recipes" box under
 * every reply would be noise in the middle of a conversation. The same applies while the query is
 * in flight: a skeleton that appears after the answer has already been read is a flicker, not
 * feedback.
 *
 * It scrolls past the sheet's gutter on both edges, the way the home shelf does, so a third card
 * is visibly there to be reached rather than cut off at the margin.
 */
export const RecipeRow = ({ recipeIds }: Props) => {
  const tVocabulary = useTranslations("Vocabulary");
  const { recipes } = useAssistantRecipes(recipeIds);

  if (recipes.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.shelf}
      contentContainerStyle={styles.cards}
    >
      {recipes.map((recipe) => (
        <CardRecipe
          key={recipe.id}
          title={recipe.title}
          subtitle={tVocabulary(`Cuisines.${recipe.cuisine}`)}
          imageSrc={recipe.coverImageUrl ? { uri: recipe.coverImageUrl } : COVER_PLACEHOLDER}
          style={{ width: CARD_WIDTH }}
          onPress={() => router.push(`/recipe/${recipe.id}`)}
        />
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Pulls the shelf out of the message's own left inset so it runs edge to edge. */
  shelf: {
    marginHorizontal: -theme.spacing[28],
  },
  cards: {
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[28],
    paddingBottom: theme.spacing[16],
  },
});
