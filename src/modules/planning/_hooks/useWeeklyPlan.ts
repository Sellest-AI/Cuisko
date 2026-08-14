import { useCallback, useMemo, useState } from "react";
import { router } from "expo-router";

import type { Plate } from "@ui/carousels/plate";
import type { WeekDay } from "@ui/week-strip";

import { addDays, MealSlot, isSameDay, toDateParam, MealStatus } from "../_model/model";
import { usePlanningList } from "./usePlanningList";
import { compareDates } from "@shared/dates";

/**
 * What the carousel draws, plus the slot in the week it fills. Structural — see ADR 0002.
 *
 * Named for the carousel and not the plan, because `_model/` already exports a `PlannedMeal` and
 * the two are different shapes: that one is the plate as the domain stores it, this one is the
 * handful of fields a `Plate` needs. One name over both left the call site unable to say which.
 */
export type CarouselMeal = {
  title: string;
  status: MealStatus;
  imageSrc: Plate["imageSrc"];
  date: Date;
  type: MealSlot;
};

/** Days shown either side of today. */
const DAYS_BEFORE = 5;
const DAYS_AFTER = 2;

/**
 * Placeholder: every past day reads as cooked and today as still open. Real status is per-day
 * data, not a function of the calendar — this goes when the plan comes from Convex.
 */
const _statusFor = (offset: number): WeekDay["status"] => {
  if (offset < 0) return "complete";
  if (offset === 0) return "pending";
  return "empty";
};

const _buildWeek = (today: Date): WeekDay[] =>
  Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, index) => {
    const offset = index - DAYS_BEFORE;

    return { date: addDays(today, offset), status: _statusFor(offset) };
  });

/**
 * The week strip, the plates on it, and which one is in focus.
 *
 * Data is hardcoded here on purpose: the interface comes first, so the screen is built against the
 * shape it will keep and swapping in `api.router.*` later touches this file alone
 * (ARCHITECTURE.md § Build order, ADR 0006).
 */
export const useWeeklyPlan = () => {
  /**
   * One "today" per mount. Rebuilding it every render would rebuild every `Date` with it, and the
   * strip's identity would change under the carousel on any unrelated state change.
   */
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => _buildWeek(today), [today]);

  /**
   * `toDateParam`, not `toDateString`: the list validates this through `parseDateParam`, which
   * takes `YYYY-MM-DD` and returns nothing for anything else — so a `Date`'s own string format
   * was being dropped on every render and the carousel always opened on the first plate.
   */
  const { rows } = usePlanningList(toDateParam(today));

  const meals: CarouselMeal[] = useMemo(() => rows
    .filter((row) => row.kind === "meal")
    .filter((row) => {
      const date = days[0];
      if (!date) return true;
      return compareDates(row.date, date.date) >= 0;
    })
    .filter((row) => {
      const date = days[days.length - 1];
      if (!date) return true;
      return compareDates(row.date, date.date) <= 0;
    })
    .map((row) => ({
      title: row.meal.title,
      status: row.meal.status,
      imageSrc: row.meal.imageSrc,
      date: new Date(row.date),
      type: row.meal.slot,
    })), [days, rows]);

  const [selectedDate, setSelectedDate] = useState(today);
  const [mealType, setMealType] = useState<MealSlot>("lunch");

  const selectedDayIndex = useMemo(() => days.findIndex((day) => isSameDay(day.date, selectedDate)), [days, selectedDate]);

  /**
   * The plate the day and the meal toggle agree on. Only today carries both a lunch and a
   * dinner, so fall back to the day alone — otherwise picking a past day while the toggle
   * says "lunch" matches nothing and the carousel sits where it was. -1 it ignores.
   */
  const exactMatch = useMemo(() => meals.findIndex(
    (meal) => isSameDay(meal.date, selectedDate) && meal.type === mealType,
  ), [meals, selectedDate, mealType]);

  const selectedMealIndex = useMemo(
    () => (exactMatch === -1
      ? meals.findIndex((meal) => isSameDay(meal.date, selectedDate))
      : exactMatch),
    [exactMatch, meals, selectedDate],
  );

  /**
   * A day in the strip is the way into the planning screen, not a filter on the carousel beside
   * it. Home answers "what am I cooking now"; asking about any day at all — today included — is
   * asking about the week, and the week is a page.
   *
   * The date travels as `YYYY-MM-DD` so it survives the route as text. The carousel still moves
   * the strip's selection through `selectMeal`, which is why that state is not dead.
   */
  const selectDay = useCallback((day: WeekDay) => {
    router.push({ pathname: "/planning", params: { date: toDateParam(day.date) } });
  }, []);

  const selectMeal = useCallback((meal: CarouselMeal) => {
    setSelectedDate(meal.date);
    setMealType(meal.type);
  }, []);

  const toggleMealType = useCallback(
    () => setMealType((current) => (current === "lunch" ? "dinner" : "lunch")),
    [],
  );

  return {
    days,
    meals,
    selectedDate,
    mealType,
    isSelectedToday: isSameDay(selectedDate, today),
    selectedDayIndex,
    selectedMealIndex,
    selectDay,
    selectMeal,
    toggleMealType,
  };
};
