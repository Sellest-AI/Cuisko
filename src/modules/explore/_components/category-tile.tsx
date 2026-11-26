import { Platform, type ViewStyle } from "react-native";

import { CardCategory } from "@ui/cards/category";
import { useTranslations } from "translations";

import type { ExploreCategory } from "../_model/exploreCategories";

type Props = {
  category: ExploreCategory;
  isSelected?: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

/**
 * A cuisine's tile, as the Explore page and home's featured categories both draw it.
 *
 * The one place that picks the emoji: the flag on a phone, the dish on the web, where Windows
 * draws a flag as two letters (`ExploreCategory`).
 */
export const CategoryTile = ({ category, isSelected, onPress, style }: Props) => {
  /** A cuisine is a shared vocabulary, so its words live with the rest of them. */
  const tVocabulary = useTranslations("Vocabulary");

  return (
    <CardCategory
      label={tVocabulary(`Cuisines.${category.cuisine}`)}
      emoji={Platform.OS === "web" ? category.dish : category.flag}
      isSelected={isSelected}
      onPress={onPress}
      style={style}
    />
  );
};
