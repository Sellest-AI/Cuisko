import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { CardRecipe } from "@ui/cards/recipe";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useWeekIdeas } from "~/modules/planning/hooks";
import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";

const CARD_WIDTH = 160;

/**
 * What the week is worth cooking — a shelf to browse, not a plan to follow.
 *
 * The title offers ideas rather than announcing a selection: the plan above it is the only thing
 * on this page the user has committed to, and a second list that looks like a second plan reads as
 * one more thing to keep up with (PRODUCT.md, anti-goal 4).
 *
 * Nothing to show, no section: loading and a genuinely empty pool look the same, because an empty
 * shelf with a title is a promise the page cannot keep.
 */
export const WeeklySpotlight = () => {
  const t = useTranslations("Home");
  const tVocabulary = useTranslations("Vocabulary");
  const { ideas } = useWeekIdeas();

  if (ideas.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text.Lg style={styles.gutter}>{t("Spotlight.title")}</Text.Lg>
      <ScrollView
        horizontal
        style={styles.shelf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.gutter, styles.cards]}
      >
        {ideas.map((card) => (
          <CardRecipe
            key={card.id}
            title={card.title}
            subtitle={tVocabulary(`Cuisines.${card.cuisine}`)}
            imageSrc={card.coverImageUrl ? { uri: card.coverImageUrl } : COVER_PLACEHOLDER}
            style={{ width: CARD_WIDTH }}
            onPress={() => router.push(`/recipe/${card.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing[28] },
  /** The page gutter, applied per row: the shelf scrolls edge to edge behind it. */
  gutter: {
    paddingLeft: theme.spacing[16],
    paddingRight: theme.spacing[16],
  },
  shelf: { paddingVertical: theme.spacing[16] },
  cards: { gap: theme.spacing[12] },
});
