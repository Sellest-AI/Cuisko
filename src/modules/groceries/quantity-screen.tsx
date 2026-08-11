import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { QuantityOption } from "@ui/cards/quantity-option";
import { Text } from "@ui/text";
import { theme } from "theme";

import { isIntent, isUnit, unitLabel, type Intent, type Unit } from "./_model/model";
import { useQuantityPicker } from "./_hooks/useQuantityPicker";

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

const Picker = ({
  ingredientId,
  unit,
  intent,
  onClose,
}: {
  ingredientId: string;
  unit: Unit;
  intent: Intent;
  onClose: () => void;
}) => {
  const { width } = useWindowDimensions();
  const { ingredient, prompt, options, owned, submit } = useQuantityPicker({ ingredientId, unit, intent });

  const columns = Math.min(COLUMNS, options.length);
  const itemWidth = (width - GUTTER * 2 - GAP * (columns - 1)) / columns;

  /**
   * One tap answers the question and leaves. Nothing to confirm: every amount on offer is
   * reversible from the card the sheet just came from.
   */
  const choose = (amount: number) => {
    submit(amount);
    onClose();
  };

  const subtitle = [ingredient?.name, owned > 0 ? owned : undefined].filter(Boolean).join(" · ");

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
      <View style={styles.grid}>
        {options.map((option) => (
          <QuantityOption
            key={`${option.amount}:${option.unit}`}
            amount={option.amount}
            unit={unitLabel(option.unit)}
            caption={option.caption}
            type={intent === "remove" ? "undo" : "default"}
            width={itemWidth}
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
