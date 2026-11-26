import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { toDateParam } from "@shared/dates";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { CategoryTile } from "./_components/category-tile";
import { featuredCategoriesOf } from "./_model/exploreCategories";
import { exploreRoute } from "./routes";

type Props = {
  style?: StyleProp<ViewStyle>;
};

/** Ten tiles, in five rows of two: the day's hand of the twelve cuisines. */
const COUNT = 10;

/**
 * The hand dealt into two columns, alternately, so a row still reads in the day's order:
 * the first and second tiles side by side, then the third and fourth.
 */
const _columnsOf = <T,>(categories: T[]): [T[], T[]] => [
  categories.filter((_, index) => index % 2 === 0),
  categories.filter((_, index) => index % 2 === 1),
];

/**
 * Home's way into the Explore page by a cuisine, for home to place.
 *
 * At the module root because `home/` renders it, on the same footing as `recipes/favorite-recipes`.
 * The day's hand is dealt on the device, from the local day, with no call: every visit that day
 * shows the same ten, and the next day another order. Computed once per mount, as the Explore
 * grid's day is.
 */
export const FeaturedCategories = ({ style }: Props) => {
  const t = useTranslations("Home");
  const [columns] = useState(() => _columnsOf(featuredCategoriesOf(toDateParam(new Date()), COUNT)));

  return (
    <View style={[styles.container, style]}>
      <Text.Lg>{t("FeaturedCategories.title")}</Text.Lg>
      <View style={styles.grid}>
        {columns.map((column, index) => (
          <View key={index} style={styles.column}>
            {column.map((category) => (
              <CategoryTile
                key={category.cuisine}
                category={category}
                onPress={() => router.push(exploreRoute(category.cuisine))}
                style={{ flex: 1, paddingHorizontal: theme.spacing[16] }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: theme.spacing[16], gap: theme.spacing[16] },
  grid: { flexDirection: "row", gap: theme.spacing[12] },
  /** Each takes half the row, and its tiles its full width. */
  column: { flex: 1, gap: theme.spacing[12] },
});
