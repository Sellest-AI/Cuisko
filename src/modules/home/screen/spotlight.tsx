import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { CardRecipe } from "@ui/cards/recipe";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

const CARD_PLACEHOLDER = require("assets/placeholders/empty-placeholder.jpg");

/**
 * Placeholder until the week's picks come from Convex. The ids are stand-ins for the document id
 * the query will carry, and are here so the card already routes by the recipe it shows — three
 * cards sharing one hardcoded destination is a bug that only appears once the data is real.
 */
const SPOTLIGHT = [
  { id: "pizza-atomica", title: "Pizza Atomica", subtitle: "Italian" },
  { id: "asparagus-salad", title: "Asparagus Salad", subtitle: "Italian" },
  { id: "pasta-carbonara", title: "Pasta Carbonara", subtitle: "Italian" },
];

const CARD_WIDTH = 200;

/**
 * What the week is worth cooking — a shelf to browse, not a plan to follow.
 *
 * The title offers ideas rather than announcing a selection: the plan above it is the only thing
 * on this page the user has committed to, and a second list that looks like a second plan reads as
 * one more thing to keep up with (PRODUCT.md, anti-goal 4).
 */
export const WeeklySpotlight = () => {
  const t = useTranslations("Home");

  return (
    <View style={styles.container}>
      <Text.Lg style={styles.gutter}>{t("Spotlight.title")}</Text.Lg>
      <ScrollView
        horizontal
        style={styles.shelf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.gutter, styles.cards]}
      >
        {SPOTLIGHT.map((recipe) => (
          <CardRecipe
            key={recipe.id}
            title={recipe.title}
            subtitle={recipe.subtitle}
            imageSrc={CARD_PLACEHOLDER}
            style={{ width: CARD_WIDTH }}
            onPress={() => router.push(`/recipe/${recipe.id}`)}
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
