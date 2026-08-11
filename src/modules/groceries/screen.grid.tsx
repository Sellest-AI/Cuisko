import { useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions, View, ViewStyle } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { GroceryItem, type GroceryItemVariant } from "@ui/cards/grocery-item";
import { CheckIcon, IconComponent, PlusIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";

import { formatQuantity, type Section, type StockRow } from "./_model/model";
import { useGroceryList } from "./_hooks/useGroceryList";

const COLUMNS = 3;
const GAP = theme.spacing[8];
const GUTTER = theme.spacing[16];

const HEADER_TRANSITION = LinearTransition.duration(200);

/**
 * The three sections, in the order stock runs through them: what is missing, what the household
 * owns, and what it has bought before but has neither of.
 *
 * Presentation only. What a tap in each one *does* is fixed by the model, not chosen here: a row
 * carries the intent of the section it sits in, so "Recently Bought" can only ever put something
 * back on the list and the cellar can only ever take stock out of it. What that second one means
 * is then decided by the clock — inside the undo window it gives a mistap back to the list, past
 * it the food was used — which is why the cellar needs no second row and no second gesture.
 */
const SECTIONS: {
  section: Section;
  label: string;
  icon?: IconComponent;
  color: string;
}[] = [
    { section: "to-buy", label: "To Buy", icon: PlusIcon, color: theme.colors.primary.base },
    { section: "cellar", label: "Cellar", icon: CheckIcon, color: theme.colors.secondary.base },
    {
      section: "recently-bought",
      label: "Recently Bought",
      color: theme.colors.neutral.muted,
    },
  ];

/**
 * A card says which of three things it is: still missing, owned, or only remembered — and an
 * owned card that is still inside the undo window says that too, because it is the one a mistap
 * has to be able to find.
 */
const variantFor = (row: StockRow): GroceryItemVariant => {
  if (row.section === "to-buy") return "pending";
  if (row.section === "recently-bought") return "memory";

  return row.undoable ? "recent" : "settled";
};

type Row =
  | { kind: "header"; id: string; label: string; icon?: IconComponent; color: string }
  | { kind: "item"; stock: StockRow };

/** Full width, so it breaks the row it lands on and the next card starts a fresh line. */
const SectionHeader = ({
  label,
  icon: Icon,
  color,
  style,
}: Omit<Extract<Row, { kind: "header" }>, "kind" | "id"> & { style?: ViewStyle }) => (
  <Animated.View layout={HEADER_TRANSITION} style={[styles.section, style]}>
    <Text.Lg>{label}</Text.Lg>
    {Icon && <Icon size={20} color={color} />}
  </Animated.View>
);

/**
 * The three lists, as one grid.
 *
 * Every card and every header is a sibling in a single wrapping container, produced by a single
 * keyed `.map`. That is what lets a card reflow rather than jump: when the cards around it change,
 * React matches it by key, keeps the instance, and the card's own `layout` transition carries it
 * to its new box while its neighbours close the gap. Split the sections into three containers and
 * this stops working silently — a card would unmount on one side and mount on the other, which is
 * an exit and an enter with nothing in between.
 *
 * Crossing a header is a move for the same reason, because the key survives it: a row keeps its
 * `ingredient:unit` identity wherever it sits, so buying something carries that one card out of
 * "To Buy" and down into the cellar. Only the leftover row of a part-bought ingredient — which
 * cannot share that key with the row beside it — enters and leaves, and fades when it does.
 *
 * An empty section draws no header. There is nothing to say about a cellar you have not filled.
 */
export const GroceryGrid = () => {
  const { width } = useWindowDimensions();
  const { sections, submit } = useGroceryList();
  const router = useRouter();

  const itemWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  /**
   * Ask, unless there is nothing to ask. A row with a single possible amount — the last bread in
   * the cellar — moves on the tap itself rather than opening a sheet to have that confirmed.
   */
  const tap = (stock: StockRow) => {
    if (stock.onlyOption !== null) return submit(stock, stock.onlyOption);

    /** The sheet answers for one ingredient in one unit — the pair the row was merged on. */
    return router.push({
      pathname: "/quantity",
      params: { ingredientId: stock.ingredientId, unit: stock.unit, intent: stock.intent },
    });
  };

  const rows: Row[] = SECTIONS.flatMap(({ section, label, icon, color }) => {
    const items = sections[section];

    if (items.length === 0) return [];

    return [
      { kind: "header" as const, id: `header:${section}`, label, icon, color },
      ...items.map((stock): Row => ({ kind: "item" as const, stock })),
    ];
  });

  return (
    <View style={styles.grid}>
      {rows.map((row, index) => {
        if (row.kind === "header")
          return <SectionHeader
            key={row.id}
            label={row.label}
            icon={row.icon}
            color={row.color}
            style={index === 0 ? { marginTop: 0 } : undefined}
          />

        const type = variantFor(row.stock);
        const quantity = type === "memory" ? undefined :
          formatQuantity(row.stock.amount, row.stock.unit);

        return (
          <GroceryItem
            key={row.stock.id}
            name={row.stock.name}
            quantity={quantity}
            emoji={row.stock.emoji}
            variant={variantFor(row.stock)}
            width={itemWidth}
            onPress={() => tap(row.stock)}
          />
        )
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    paddingHorizontal: GUTTER,
  },
  section: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[4],
  },
});
