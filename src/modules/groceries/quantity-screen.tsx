import { useCallback, useState } from "react";
import { Dimensions, LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";

import { QuantityOption } from "@ui/cards/quantity-option";
import { Trash2 } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useModalAction } from "~/modules/navigation/modal-action";
import { formatQuantity, isIntent, isUnit, unitLabel, type Intent, type Unit } from "./_model/model";
import { useQuantityPicker } from "./_hooks/useQuantityPicker";
import { useRemoveItem } from "./_hooks/useRemoveItem";
import { AmountInput } from "./quantity-screen.amount-input";
import { MODAL_CHROME_OFFSET } from "../navigation/constants";

const COLUMNS = 3;
const GAP = theme.spacing[8];
const GUTTER = theme.spacing[16];
const SCREEN_WIDTH = Dimensions.get("window").width - GUTTER;

type Params = {
  ingredientId?: string;
  unit?: string;
  /** Which section was tapped — it decides both the wording and what the first tile offers. */
  intent?: string;
};

type Props = {
  params: Params;
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
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
  onLayout,
}: {
  ingredientId: string;
  unit: Unit;
  intent: Intent;
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) => {
  const t = useTranslations("Groceries");
  const [entryUnit, setEntryUnit] = useState<Unit>(rowUnit);

  const { ingredient, prompt, options, owned, submit } = useQuantityPicker({
    ingredientId,
    unit: entryUnit,
    intent,
  });
  const { remove } = useRemoveItem({ ingredientId, unit: rowUnit });

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
  /**
   * A link can name an ingredient that does not exist, and the shape checks upstream cannot tell:
   * they see a well-formed id. Submitting anyway writes a line the grid then drops on the floor —
   * `buildSections` skips a ref with no ingredient — leaving state nothing on screen can reach.
   */
  if (!ingredient) return <Nothing />;

  const subtitle = [ingredient?.name, owned > 0 ? formatQuantity(owned, entryUnit) : undefined]
    .filter(Boolean)
    .join(" · ");

  return (
    <View onLayout={onLayout} style={styles.container}>
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
            caption={option.captionKey ? t(option.captionKey) : undefined}
            type={option.type}
            onPress={() => choose(option.amount)}
            style={{ width: SCREEN_WIDTH / COLUMNS - GAP * 2 }}
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
const Nothing = () => {
  const t = useTranslations("Groceries");

  return (
    <View style={[styles.container, styles.empty]}>
      <Text.Base color={theme.colors.muted}>{t("Quantity.nothing_to_adjust")}</Text.Base>
    </View>
  );
};

export const QuantityScreen = ({ params, onClose, onLayout }: Props) => {
  const { ingredientId, unit, intent } = params;

  if (!ingredientId || !isUnit(unit) || !isIntent(intent)) return <Nothing />;

  return <Picker ingredientId={ingredientId} unit={unit} intent={intent} onClose={onClose} onLayout={onLayout} />;
};

const styles = StyleSheet.create({
  /**
   * Auto-height, and it has to stay that way: `useMeasuredModalSheet` measures this column to size
   * the sheet, so a `flex: 1` here would report the sheet's own height back as the next detent. The
   * old `justifyContent: "flex-end"` went with the flex — the column now ends where its content does.
   */
  container: {
    alignItems: "center",
    paddingHorizontal: GUTTER,
    paddingTop: MODAL_CHROME_OFFSET,
    paddingBottom: Platform.select({ android: theme.spacing[24], default: theme.spacing[8] }),
  },
  empty: {
    minHeight: 180,
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
    marginBottom: theme.spacing[8],
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    justifyContent: "center",
  },
});
