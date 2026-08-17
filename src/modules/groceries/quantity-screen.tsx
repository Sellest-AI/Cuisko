import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { QuantityOption } from "@ui/cards/quantity-option";
import { Trash2 } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";

import { useModalAction } from "~/modules/navigation/modal-action";
import { formatQuantity, isIntent, isUnit, unitLabel, type Intent, type Unit } from "./_model/model";
import { useQuantityPicker } from "./_hooks/useQuantityPicker";
import { useRemoveItem } from "./_hooks/useRemoveItem";
import { AmountInput } from "./quantity-screen.amount-input";

const COLUMNS = 3;
const GAP = theme.spacing[8];
const GUTTER = theme.spacing[16];

type Params = {
  ingredientId?: string;
  unit?: string;
  /** Which section was tapped — it decides both the wording and what the first tile offers. */
  intent?: string;
};

type Props = {
  params: Params;
  onClose: () => void;
};

/**
 * Two units reach this sheet and they are not the same one.
 *
 * `rowUnit` is the card's, fixed the moment it was tapped, and it is what the row *is* — the trash
 * action deletes by it. `entryUnit` is what the shopper is typing in, and it may wander: coming
 * home with 500 g of something the plan asked for in pieces is an ordinary thing to do, and the
 * tiles follow it there — though nothing converts between the two, so the plan's row goes on
 * asking in pieces and the shopper ends up with a second row rather than a closed gap. Feeding
 * the wandering unit to a destructive action is how a tap meant for the onions on the list took
 * the soup's claim instead.
 */
const Picker = ({
  ingredientId,
  unit: rowUnit,
  intent,
  onClose,
}: {
  ingredientId: string;
  unit: Unit;
  intent: Intent;
  onClose: () => void;
}) => {
  const { width } = useWindowDimensions();
  const [entryUnit, setEntryUnit] = useState<Unit>(rowUnit);

  const { ingredient, prompt, options, owned, submit } = useQuantityPicker({
    ingredientId,
    unit: entryUnit,
    intent,
  });
  const { remove } = useRemoveItem({ ingredientId, unit: rowUnit });

  const columns = Math.min(COLUMNS, options.length);
  const itemWidth = (width - GUTTER * 2 - GAP * (columns - 1)) / columns;

  /** Stable, or `useModalAction`'s memo rebuilds and re-registers the action on every keystroke. */
  const discard = useCallback(() => {
    remove();
    onClose();
  }, [remove, onClose]);

  /**
   * Only a row on the list can be struck off it. There is nothing to delete in the cellar — stock
   * leaves it by being taken out — and nothing in memory, which is derived and holds no row.
   */
  useModalAction(intent === "buy" ? { icon: Trash2, onPress: discard, variant: "danger" } : null);

  /**
   * One tap answers the question and leaves. Nothing to confirm: every amount on offer is
   * reversible from the card the sheet just came from.
   */
  const choose = useCallback(
    (amount: number) => {
      submit(amount);
      onClose();
    },
    [submit, onClose],
  );

  /** Carries its unit, because `owned` follows `entryUnit` — a bare number would change meaning. */
  const subtitle = [ingredient?.name, owned > 0 ? formatQuantity(owned, entryUnit) : undefined]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.neutral.subtle, theme.colors.neutral.foreground]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
      />
      <View style={styles.header}>
        <Text.H4 style={styles.emoji}>{ingredient?.emoji}</Text.H4>
        <View>
          {subtitle && <Text.Sm color={theme.colors.muted}>{subtitle}</Text.Sm>}
          <Text.Lg>{prompt}</Text.Lg>
        </View>
      </View>
      <AmountInput
        unit={entryUnit}
        onUnitChange={intent === "remove" ? undefined : setEntryUnit}
        onSubmit={choose}
      />
      <View style={styles.grid}>
        {options.map((option) => (
          <QuantityOption
            key={`${option.amount}:${option.unit}`}
            amount={option.amount}
            unit={unitLabel(option.unit)}
            caption={option.caption}
            type={intent === "remove" ? "undo" : "default"}
            width={itemWidth - 1}
            onPress={() => choose(option.amount)}
          />
        ))}
      </View>
    </View>
  );
};

/**
 * The quantity sheet: how much was added, taken back, or taken out.
 *
 * A route of its own rather than a sheet inside the grid, so it can be reached from any card on
 * any screen. Its params are therefore untrusted — a deep link can carry anything — which is why
 * they are validated here before a hook reads them.
 */
export const QuantityScreen = ({ params, onClose }: Props) => {
  const { ingredientId, unit, intent } = params;

  if (!ingredientId || !isUnit(unit) || !isIntent(intent)) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Text.Base color={theme.colors.muted}>Nothing to adjust.</Text.Base>
      </View>
    );
  }

  return <Picker ingredientId={ingredientId} unit={unit} intent={intent} onClose={onClose} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: theme.spacing[16],
  },
  empty: {
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[12],
    width: "100%",
    marginBottom: theme.spacing[20],
  },
  /** Overrides the H4 metrics — an emoji needs the room a heading does not. */
  emoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  grid: {
    flexDirection: "row",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: GAP,
    marginBottom: theme.spacing[24],
  },
});
