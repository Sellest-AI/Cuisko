import { StyleSheet, View, ViewStyle } from "react-native";

import { CardMeal } from "@ui/cards/meal";
import { DayMarker } from "@ui/day-marker";
import { ArrowLeftRight, EllipsisVertical, Plus } from "@ui/icons";
import { resolveLocale, useTranslations } from "translations";

import type { MealCard, PlanningRow } from "../_model/model";
import { EMPTY_PLATE_IMAGE, MEAL_IMAGE } from "../_hooks/placeholders";
import { MEAL_STATUS } from "./meal-status";

/** The rail the date marker sits in. Rows without one indent past it, so the cards stay aligned. */
const MARKER_RAIL = 48;

type Props = {
  /** The kept week's plates and the draft's alike — see `MealCard`. */
  row: PlanningRow<MealCard>;
  /** The swap arrows in the tunnel's review step, the overflow dots on the planning screen. */
  variant?: "plan" | "review";
  onPress?: () => void;
  onTrailingPress?: () => void;
  style?: ViewStyle;
};

/**
 * One plate in the list, with the date beside it when it opens a new day.
 *
 * The marker is a sibling of the card rather than a header above it, because a day is a column
 * here: two meals on Tuesday read as one day with two plates, not as two rows under a title.
 *
 * At `_components/` rather than beside a screen because both the planning list and the tunnel's
 * review step draw it — dot notation would claim a single parent it no longer has.
 */
export const PlanningListRow = ({ style, row, variant = "plan", onPress, onTrailingPress }: Props) => {
  const t = useTranslations("Planning");
  const locale = resolveLocale();

  const slot = row.kind === "meal" ? row.meal.slot : row.slot;
  const status = row.kind === "meal" ? row.meal.status : "empty";

  const isToday = row.date.toLocaleDateString(locale) === new Date().toLocaleDateString(locale);
  const hasTrailing = variant === "review" || status !== "cooked";
  const maxTitleLength = hasTrailing ? 17 : 23;

  return (
    <View style={[styles.row, style]}>
      <View style={styles.rail}>
        {row.isDayStart && (
          <DayMarker
            date={row.date}
            status={row.dayStatus}
            locale={locale}
            selected={isToday}
          />
        )}
      </View>
      {row.kind === "meal" ? (
        <CardMeal
          style={styles.card}
          title={row.meal.title.slice(0, maxTitleLength).trim().concat(row.meal.title.length > maxTitleLength ? "…" : "")}
          duration={row.meal.minutes === undefined ? undefined : t("Meal.x_minutes", { count: row.meal.minutes })}
          servings={row.meal.servings}
          slot={slot}
          slotLabel={t(slot === "dinner" ? "Meal.dinner" : "Meal.lunch")}
          status={status}
          statusLabel={t(MEAL_STATUS[status].key)}
          statusIcon={MEAL_STATUS[status].icon}
          emoji={row.meal.emoji}
          imageSrc={row.meal.imageSrc ?? MEAL_IMAGE}
          onPress={onPress}
          /** A cooked plate is history: nothing left to re-portion, swap or drop, so no menu to open. */
          trailingIcon={!hasTrailing ? undefined : variant === "review" ? ArrowLeftRight : EllipsisVertical}
          onTrailingPress={onTrailingPress}
        />
      ) : (
        <CardMeal
          style={styles.card}
          title={t("Screen.empty_plate")}
          subtitle={t("Screen.import_receipt")}
          slot={slot}
          status="empty"
          imageSrc={EMPTY_PLATE_IMAGE}
          onPress={onPress}
          trailingIcon={Plus}
          onTrailingPress={onTrailingPress ?? onPress}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rail: {
    width: MARKER_RAIL,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { flex: 1 },
});
