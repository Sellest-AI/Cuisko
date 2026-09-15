import { router } from "expo-router";
import { FlatList, StyleSheet, View, type ViewStyle } from "react-native";

import { CardRecipe } from "@ui/cards/recipe";
import { Text } from "@ui/text";
import { theme } from "theme";

import { COVER_PLACEHOLDER } from "../constants";

/** What a card on the shelf needs, and nothing the row does not draw. Structural — see ADR 0002. */
export type ShelfRecipe = {
  id: string;
  title: string;
  /** Already a word, not a key: the shelf does not own the cuisine vocabulary, the screen does. */
  subtitle: string;
  coverImageUrl?: string;
};

type Props = {
  title: string;
  recipes: ShelfRecipe[];
  style?: ViewStyle;
};

/**
 * Narrower than a grid cell, so the second card is visibly cut off at the screen's edge — which is
 * what tells a cook the row scrolls without a scrollbar to say so.
 */
const CARD_WIDTH = 160;

/**
 * One horizontal row of recipe cards under a heading: the cook's favorites, above their own grid.
 *
 * A row rather than a second grid section, so "Your recipes" stays in reach whatever the favorite
 * count — a grid would push it down a row per two favorites. The shelf bleeds past the page
 * gutter on both sides and pads itself back, so the cards scroll edge to edge while the first
 * one still lines up with the heading.
 *
 * It draws what it is given. Whether there is anything to draw, and whether a search is in flight,
 * is the screen's to decide — the shelf is not a search surface and does not know one exists.
 */
export const FavoritesShelf = ({ title, recipes, style }: Props) => {
  return (
    <View style={style}>
      <Text.Lg>{title}</Text.Lg>
      <FlatList
        data={recipes}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.cards}
        keyExtractor={({ id }) => id}
        renderItem={({ item }) => (
          <CardRecipe
            title={item.title}
            subtitle={item.subtitle}
            imageSrc={item.coverImageUrl ? { uri: item.coverImageUrl } : COVER_PLACEHOLDER}
            style={{ width: CARD_WIDTH }}
            onPress={() => router.push(`/recipe/${item.id}`)}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  /** Out past the page gutter (`list-screen`'s `paddingHorizontal`) and back in, per row. */
  bleed: {
    marginHorizontal: -theme.spacing[16],
    marginTop: theme.spacing[8],
  },
  cards: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[8],
    paddingBottom: theme.spacing[20],
    gap: theme.spacing[12],
  },
});
