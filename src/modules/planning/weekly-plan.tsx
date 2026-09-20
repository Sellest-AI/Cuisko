import { StyleSheet, View } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { PlateCarousel } from "@ui/carousels/plate";
import { ArrowLeftRightIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { WeekStrip } from "@ui/week-strip";
import { theme } from "theme";
import { resolveLocale, useTranslations } from "translations";

import { useWeeklyPlan } from "./_hooks/useWeeklyPlan";
import { MEAL_STATUS } from "./_components/meal-status";
import { EMPTY_PLATE_IMAGE } from "./_hooks/placeholders";
import { router } from "expo-router";

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
  } = useWeeklyPlan();

  const t = useTranslations("Planning");
  const locale = resolveLocale();

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
            elevated
            variant="primary"
            onPress={toggleMealType}
            rightContent={<ArrowLeftRightIcon size={TOGGLE_ICON_SIZE} color={theme.colors.primary.foreground} />}
            style={styles.mealToggle}
          >
            {mealType === "lunch" ? t("Meal.lunch") : t("Meal.dinner")}
          </ButtonPill>
        </View>
        <Text.Base color={theme.colors.muted}>{t("WeeklyPlan.call_to_cook")}</Text.Base>
      </View>
      <PlateCarousel
        style={styles.carousel}
        items={meals.map((meal) => ({
          ...meal,
          imageSrc: meal.imageSrc ?? EMPTY_PLATE_IMAGE,
          subtitle: t(MEAL_STATUS[meal.status].key),
          onPress: () => router.push(`/recipe/${meal.recipeId}`),
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
    gap: theme.spacing[8],
  },
  headingRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[12],
    marginTop: theme.spacing[24],
  },
  mealToggle: {
    minHeight: 0,
    paddingHorizontal: theme.spacing[12],
    marginTop: 1,
  },
  carousel: {
    marginTop: theme.spacing[28],
    minHeight: 188,
  },
  week: {
    marginTop: theme.spacing[6],
  },
});
