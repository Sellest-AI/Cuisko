import { useCallback, useMemo, useState } from "react";

import type { Plate } from "@ui/carousels/plate";
import type { WeekDay } from "@ui/week-strip";

export type MealType = "lunch" | "dinner";

/** What the carousel draws, plus the slot in the week it fills. Structural — see ADR 0002. */
export type PlannedMeal = {
  title: string;
  subtitle?: string;
  imageSrc: Plate["imageSrc"];
  date: Date;
  type: MealType;
};

/** Days shown either side of today. */
const DAYS_BEFORE = 5;
const DAYS_AFTER = 2;

const _addDays = (date: Date, days: number) => {
  const shifted = new Date(date);
  shifted.setDate(date.getDate() + days);
  return shifted;
};

/** Local time on purpose — "Tuesday" has to mean the user's Tuesday, not UTC's. */
const _isSameDay = (first: Date, second: Date) =>
  first.getDate() === second.getDate() &&
  first.getMonth() === second.getMonth() &&
  first.getFullYear() === second.getFullYear();

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

    return { date: _addDays(today, offset), status: _statusFor(offset) };
  });

const PLATE_PLACEHOLDER = require("assets/placeholders/asparagus-plate.png");

/** Placeholder plates, spread so that today carries both a lunch and a dinner. */
const _buildMeals = (today: Date): PlannedMeal[] => [
  { title: "Pizza", subtitle: "Italian", imageSrc: PLATE_PLACEHOLDER, date: _addDays(today, -DAYS_BEFORE), type: "dinner" },
  { title: "Pizza", subtitle: "Italian", imageSrc: PLATE_PLACEHOLDER, date: today, type: "lunch" },
  { title: "Gnocchi", subtitle: "Italian", imageSrc: PLATE_PLACEHOLDER, date: today, type: "dinner" },
  { title: "Pizza", subtitle: "Italian", imageSrc: PLATE_PLACEHOLDER, date: _addDays(today, 1), type: "dinner" },
];

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
  const meals = useMemo(() => _buildMeals(today), [today]);

  const [selectedDate, setSelectedDate] = useState(today);
  const [mealType, setMealType] = useState<MealType>("lunch");

  const selectedDayIndex = days.findIndex((day) => _isSameDay(day.date, selectedDate));

  /**
   * The plate the day and the meal toggle agree on. Only today carries both a lunch and a
   * dinner, so fall back to the day alone — otherwise picking a past day while the toggle
   * says "lunch" matches nothing and the carousel sits where it was. -1 it ignores.
   */
  const exactMatch = meals.findIndex(
    (meal) => _isSameDay(meal.date, selectedDate) && meal.type === mealType,
  );
  const selectedMealIndex =
    exactMatch === -1
      ? meals.findIndex((meal) => _isSameDay(meal.date, selectedDate))
      : exactMatch;

  const selectDay = useCallback((day: WeekDay) => setSelectedDate(day.date), []);

  const selectMeal = useCallback((meal: PlannedMeal) => {
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
    isSelectedToday: _isSameDay(selectedDate, today),
    selectedDayIndex,
    selectedMealIndex,
    selectDay,
    selectMeal,
    toggleMealType,
  };
};
