import { View, StyleSheet } from "react-native";

import { GroceryItem } from "@ui/cards/grocery-item";
import { Text } from "@ui/text";
import { theme } from "theme";

type Props = {
  title: string;
  titleSize?: "base" | "lg";
  items: { emoji: string; name: string; quantity?: string; imageUrl?: string }[];
  /** Measured by the screen, so every group's columns line up on one grid. */
  itemWidth: number;
};

/**
 * One aisle of the ingredient list — the vegetables, the store cupboard — as a wrapped grid.
 *
 * Shared by the ingredients tab and by a single step of the step-by-step, which is why it sits in
 * `_components/` rather than in dot notation beside either of them.
 */
export const IngredientGroup = ({ titleSize, title, items, itemWidth }: Props) => {
  const Title = titleSize === "lg" ? Text.Lg : Text.Base;

  return (<View>
    <Title color={titleSize === "lg" ? theme.colors.foreground : theme.colors.neutral.muted}>
      {title}
    </Title>
    <View style={styles.grid}>
      {items.map((item) => (
        <GroceryItem
          key={item.name + item.quantity}
          emoji={item.emoji}
          imageUrl={item.imageUrl}
          name={item.name}
          quantity={item.quantity}
          variant="ghost"
          width={itemWidth}
          style={{ marginBottom: theme.spacing[16] }}
        />
      ))}
    </View>
  </View>);
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[8],
    marginTop: theme.spacing[20],
  },
});
