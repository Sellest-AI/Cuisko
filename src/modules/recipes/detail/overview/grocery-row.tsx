import { View, StyleSheet, ScrollView } from "react-native";

import { GroceryItem } from "@ui/cards/grocery-item";
import type { ImageProps } from "@ui/image";
import { Text } from "@ui/text";
import { theme } from "theme";

import { SCREEN_PADDING } from "../../constants";

type Props = {
  title: string;
  /** Right-hand note on the heading — Example: "For 2 people". */
  caption?: string;
  items: { emoji: string; name: string; imageUrl?: string; imageSrc?: ImageProps["source"] }[];
};

/**
 * A titled row of things — utensils, ingredients — that scrolls sideways.
 *
 * The row bleeds to both screen edges and pads its own content instead of sitting inside a gutter,
 * so a list longer than the screen looks cut off by the screen rather than by a margin.
 */
export const GroceryRow = ({ title, caption, items }: Props) => (
  <View>
    <View style={styles.heading}>
      <Text.Lg>{title}</Text.Lg>
      {caption && <Text.Base color={theme.colors.neutral.muted}>{caption}</Text.Base>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => (
        <GroceryItem
          key={item.name}
          emoji={item.emoji}
          imageUrl={item.imageUrl}
          imageSrc={item.imageSrc}
          name={item.name}
          variant="ghost"
        />
      ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: SCREEN_PADDING,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  row: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: theme.spacing[8],
    marginTop: theme.spacing[20],
    gap: theme.spacing[24],
  },
});
