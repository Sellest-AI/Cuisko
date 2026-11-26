import { StyleSheet, View } from "react-native";

import type { Cuisine } from "@shared/cuisines";
import { HorizontalScrollView } from "@ui/horizontal-scroll-view";
import { theme } from "theme";

import { CategoryTile } from "./_components/category-tile";
import { EXPLORE_CATEGORIES, type ExploreCategory } from "./_model/exploreCategories";

type Props = {
  selected: Cuisine | undefined;
  onSelect: (cuisine: Cuisine | undefined) => void;
};

/** Two tiles a column, so twelve cuisines fill two rows of six. */
const COLUMNS: ExploreCategory[][] = Array.from({ length: Math.ceil(EXPLORE_CATEGORIES.length / 2) }, (_, column) =>
  EXPLORE_CATEGORIES.slice(column * 2, column * 2 + 2),
);

/**
 * The twelve cuisines, in two rows that scroll sideways.
 *
 * Laid out by column rather than by row: a column takes the width of its longer label, so the two
 * rows stay aligned as a grid whatever the language. A tap on the selected tile clears it.
 */
export const ExploreCategories = ({ selected, onSelect }: Props) => (
  <HorizontalScrollView contentContainerStyle={styles.row} style={styles.bleed}>
    {COLUMNS.map((column) => (
      <View key={column[0]!.cuisine} style={styles.column}>
        {column.map((category) => (
          <CategoryTile
            key={category.cuisine}
            category={category}
            isSelected={selected === category.cuisine}
            onPress={() => onSelect(selected === category.cuisine ? undefined : category.cuisine)}
          />
        ))}
      </View>
    ))}
  </HorizontalScrollView>
);

const styles = StyleSheet.create({
  /** Edge to edge: the row scrolls under the page gutter, and its content starts on it. */
  bleed: { marginHorizontal: -theme.spacing[16] },
  row: { gap: theme.spacing[8], paddingHorizontal: theme.spacing[16] },
  column: { gap: theme.spacing[8] },
});
