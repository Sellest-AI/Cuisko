import { useState } from "react";
import { View, StyleSheet } from "react-native";

import { GroceryItem } from "@ui/cards/grocery-item";
import { Text } from "@ui/text";
import { theme } from "theme";
import { formatQuantity, type RecipeUnit } from "@shared/ingredients";

import { useUnitLabel } from "~/hooks/useUnitLabel";

import { convertLine, displayUnits, type Conversion } from "../_model/units";

/** How much of a line, in the recipe's own unit, and what it takes to read it in another. */
type Measure = { amount: number; unit: RecipeUnit; conversion: Conversion };

/**
 * A line as a tile draws it — the photo when the catalog has one, its emoji otherwise.
 *
 * The measure comes whole or not at all: the overview names what a dish contains without saying
 * how much, and a tile with an amount but no unit to read it in is not a state worth drawing.
 */
export type IngredientItem = { emoji: string; name: string; imageUrl?: string } & (
  | Measure
  | { amount?: undefined }
);

type Props = {
  title: string;
  titleSize?: "base" | "lg";
  items: IngredientItem[];
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
      {items.map((item, i) => {
        if (item.amount === undefined) {
          const isDuplicate = items.findIndex((other) => other.name === item.name) !== i;
          if (isDuplicate) return null;

          return (
            <GroceryItem
              key={item.name}
              emoji={item.emoji}
              imageUrl={item.imageUrl}
              name={item.name}
              variant="ghost"
              width={itemWidth}
              style={{ marginBottom: theme.spacing[16] }}
            />
          );
        }

        return (
          <MeasuredTile
            key={item.name + item.amount + item.unit}
            item={item}
            width={itemWidth}
          />
        );
      })}
    </View>
  </View>);
}

/**
 * One line, read in the next unit it can be measured in on each tap: 500 g of chicken, a third of
 * one, 500 g again. The choice is this tile's alone and is forgotten with the screen; a line that
 * cannot be read in any other unit ignores the tap.
 */
const MeasuredTile = ({ item, width }: { item: IngredientItem & Measure; width: number }) => {
  const label = useUnitLabel();
  const [shown, setShown] = useState(0);

  const units = displayUnits(item.unit, item.conversion);
  const unit = units[shown % units.length] ?? item.unit;
  const converted = convertLine(item.amount, item.unit, unit, item.conversion);

  return (
    <GroceryItem
      emoji={item.emoji}
      imageUrl={item.imageUrl}
      name={item.name}
      quantity={
        converted === undefined
          ? formatQuantity(item.amount, item.unit, label)
          : formatQuantity(converted, unit, label)
      }
      variant="ghost"
      width={width}
      onPress={units.length > 1 ? () => setShown((index) => index + 1) : undefined}
      style={{ marginBottom: theme.spacing[16] }}
    />
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[8],
    marginTop: theme.spacing[20],
  },
});
