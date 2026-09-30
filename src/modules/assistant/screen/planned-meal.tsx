import type { MealPlanned } from "@shared/assistant";
import { StyleSheet, View } from "react-native";
import { resolveLocale, useTranslations } from "translations";

import { Button } from "@ui/button";
import { CardMeal } from "@ui/cards/meal";
import { Undo2 } from "@ui/icons";
import { theme } from "theme";

import { usePlannedMeal } from "../_hooks/usePlannedMeal";

/** The dish's own picture stands in when the recipe has none, as on the planning screen. */
const EMPTY_PLATE = require("assets/placeholders/empty-plate.png");

type Props = {
  meal: MealPlanned;
  /** Which change this is, across the conversation: what its undo is remembered under. */
  changeKey: string;
};

/**
 * The plate Cuisko planned: the meal card the planning screen draws, with the day in the slot
 * label ("vendredi 2 · Dîner"), and the pill that takes it back off. Once that plate is off the
 * week, undone or changed since, the day gives way to "Dîner · Annulé": the day would say it is planned.
 *
 * The card does nothing when tapped, like the cellar change's: it is a record of what happened, and
 * the plate itself is edited from the planning screen.
 */
export const PlannedMeal = ({ meal, changeKey }: Props) => {
  const t = useTranslations("Assistant");
  const tPlanning = useTranslations("Planning");
  const { card, date, slot, servings, isLoading, isCanceled, canUndo, isUndoing, undo } = usePlannedMeal(meal, changeKey);

  if (isLoading || !card) return null;

  const day = date.toLocaleDateString(resolveLocale(), { weekday: "long", day: "numeric" });
  const mealName = tPlanning(slot === "dinner" ? "Meal.dinner" : "Meal.lunch");

  return (
    <View style={styles.container}>
      <CardMeal
        style={styles.card}
        title={card.title}
        duration={card.minutes === undefined ? undefined : tPlanning("Meal.x_minutes", { count: card.minutes })}
        servings={servings}
        slot={slot}
        slotLabel={isCanceled ? `${mealName} · ${t("meal.canceled")}` : `${day} · ${mealName}`}
        imageSrc={card.imageUrl ? { uri: card.imageUrl } : EMPTY_PLATE}
      />
      {canUndo && <Button
        variant="neutral"
        onPress={() => void undo()}
        isLoading={isUndoing}
        style={styles.pill}
        leftIcon={Undo2}
      >
        {t("meal.undo")}
      </Button>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    gap: theme.spacing[12],
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.neutral.subtle,
  },
  pill: {
    alignSelf: "flex-start",
    marginLeft: -theme.spacing[2],
  },
});
