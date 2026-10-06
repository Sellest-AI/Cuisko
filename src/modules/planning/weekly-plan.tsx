import { StyleSheet, View } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { PlateCarousel } from "@ui/carousels/plate";
import { ArrowLeftRightIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { WeekStrip } from "@ui/week-strip";
import { theme } from "theme";
import { resolveLocale, useTranslations } from "translations";

import { isSettled } from "./_model/model";
import { useWeeklyPlan } from "./_hooks/useWeeklyPlan";
import { WeeklyPlanEmpty } from "./weekly-plan.empty";
import { MEAL_STATUS } from "./_components/meal-status";
import { EMPTY_PLATE_IMAGE } from "./_hooks/placeholders";
import { router } from "expo-router";
import { recipeRoute } from "~/modules/recipes/routes";

const TOGGLE_ICON_SIZE = 14;

/**
 * This week's plates: the day in focus, the meal toggle, and the week to move through.
 *
 * At the module root rather than under `_components/` because it is this module's public surface —
 * `home/` renders it, and will not be the last to. It calls its own hook, so a consumer places the
 * tag and inherits no data obligation.
 *
 * The date and the weekday initials read in the user's language: `resolveLocale()` is the one place
 * that decides it, and `src/ui/**` may not read it itself (ADR 0002), so it arrives as a prop.
 *
 * On today the heading is a lead-in the pill beside it finishes — "Ready for [Lunch]". Each locale
 * writes its own lead-in rather than translating this one, because the two have to read as one
 * sentence: French says "Au menu", not "Prêt pour", which a bare "Déjeuner" would not follow.
 * Any other day names itself instead.
 *
 * A household with nothing planned gets `weekly-plan.empty.tsx` in place of all of this — the
 * branch is here rather than inside the parts because the heading, the toggle and the carousel
 * have nothing to say between them when there is no plan, and three separate empty checks would
 * be three chances for one of them to disagree.
 */
export const WeeklyPlan = () => {
  const {
    days,
    meals,
    selectedDate,
    mealType,
    isSelectedToday,
    selectedDayIndex,
    selectedMealIndex,
    selectDay,
    selectMeal,
    toggleMealType,
    isEmpty,
  } = useWeeklyPlan();

  const t = useTranslations("Planning");
  const locale = resolveLocale();

  if (isEmpty) return <WeeklyPlanEmpty />;

  return (
    <View>
      <View style={styles.heading}>
        <View style={styles.headingRow}>
          <Text.H4>
            {isSelectedToday
              ? t("WeeklyPlan.today_heading")
              : selectedDate.toLocaleDateString(locale, { weekday: "long", day: "numeric" })}
          </Text.H4>
          <ButtonPill
            variant="neutral"
            onPress={toggleMealType}
            rightContent={<ArrowLeftRightIcon size={TOGGLE_ICON_SIZE} color={theme.colors.neutral.muted} />}
            style={styles.mealToggle}
          >
            {mealType === "lunch" ? t("Meal.lunch") : t("Meal.dinner")}
          </ButtonPill>
        </View>
      </View>
      <PlateCarousel
        style={styles.carousel}
        items={meals.map((meal) => ({
          ...meal,
          imageSrc: meal.imageSrc ?? EMPTY_PLATE_IMAGE,
          subtitle: t(MEAL_STATUS[meal.status].key),
          onPress: () => router.push(recipeRoute(meal.recipeId, meal.servings)),
          /**
           * The same sheet the planning list's menu opens. Not on a cooked or skipped plate: that
           * one is history, and the list offers it no menu either.
           */
          onLongPress: isSettled(meal.status)
            ? undefined
            : () => router.push({ pathname: "/meal", params: { mealId: meal.id } }),
        }))}
        selectedIndex={selectedMealIndex}
        onSelect={selectMeal}
      />
      <WeekStrip
        style={styles.week}
        days={days}
        locale={locale}
        selectedIndex={selectedDayIndex}
        onSelect={selectDay}
        onAdd={() => selectDay(days[days.length - 1]!)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  heading: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  headingRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  mealToggle: {
    minHeight: 0,
    paddingHorizontal: theme.spacing[12],
    marginTop: 1,
  },
  carousel: {
    minHeight: 188,
  },
  week: {
    marginTop: theme.spacing[12],
  },
});
