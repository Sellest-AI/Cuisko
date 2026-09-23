import { useCallback, useMemo, useState } from "react";
import { router } from "expo-router";

import type { Plate } from "@ui/carousels/plate";
import type { WeekDay } from "@ui/week-strip";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import {
  addDays,
  dayStatusFor,
  inEatingOrder,
  isSameDay,
  keptMealCardOf,
  mealSlotAt,
  startOfDay,
  toDateParam,
  type MealSlot,
  type MealStatus,
} from "../_model/model";

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
  recipeId: string;
  /** How many the plate was planned for: the recipe opens scaled to it, not to what it was written for. */
  servings: number;
  imageSrc: Plate["imageSrc"];
  date: Date;
  type: MealSlot;
};

/** Days shown either side of today. */
const DAYS_BEFORE = 3;
const DAYS_AFTER = 3;

/**
 * The strip's days, each marked by where it sits against today — the same calendar answer the
 * planning list's day markers give (`dayStatusFor`), so the two screens agree about a day.
 */
const _buildWeek = (today: Date): WeekDay[] =>
  Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, index) => {
    const date = addDays(today, index - DAYS_BEFORE);

    return { date, status: dayStatusFor(date, today) };
  });

/**
 * The week strip, the plates on it, and which one is in focus.
 *
 * A range read (`getMany`), not the planning list's pages: the strip is a fixed window either side of
 * today, and a paginated read would have to be fetched until it happened to cover it.
 */
export const useWeeklyPlan = () => {
  const locale = useLocale();
  const { householdId } = useHousehold();

  /**
   * One "today" per mount, at midnight. Rebuilding it every render would rebuild every `Date` with it,
   * and the strip's identity would change under the carousel on any unrelated state change.
   */
  const [today] = useState(() => startOfDay(new Date()));
  const days = useMemo(() => _buildWeek(today), [today]);

  /** `to` is exclusive: the midnight after the strip's last day. */
  const { data, isSuccess } = useQueryCached(
    api.router.planning.getMany.authed,
    householdId
      ? {
        householdId,
        locale,
        from: addDays(today, -DAYS_BEFORE).getTime(),
        to: addDays(today, DAYS_AFTER + 1).getTime(),
      }
      : "skip",
  );

  const meals: CarouselMeal[] = useMemo(
    () => inEatingOrder((data ?? []).map(keptMealCardOf)).map((meal) => ({
      recipeId: meal.recipeId,
      servings: meal.servings,
      title: meal.title,
      status: meal.status,
      imageSrc: meal.imageSrc,
      date: meal.date,
      type: meal.slot,
    })),
    [data],
  );

  const [selectedDate, setSelectedDate] = useState(today);
  /** Opened in the evening, the carousel starts on dinner: that is the plate still to cook. */
  const [mealType, setMealType] = useState<MealSlot>(() => mealSlotAt(new Date()));

  const selectedDayIndex = useMemo(() => days.findIndex((day) => isSameDay(day.date, selectedDate)), [days, selectedDate]);

  /**
   * The plate the day and the meal toggle agree on. A planned day can hold only one of the two
   * slots — the week plans whichever slots the household picked, and a dropped meal leaves the
   * other empty — so fall back to the day alone: otherwise the toggle's half of the match finds
   * nothing and the carousel sits where it was. -1 it ignores.
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
    /**
     * A household with nothing planned in the window — not one still being read.
     *
     * `isSuccess` and not `!isPending`: a failed read also leaves `meals` empty, and drawing the
     * empty state on it would tell the user their week is unplanned when we simply do not know.
     * A skipped query (no household yet) reports pending, so nothing flashes before sign-in lands.
     */
    isEmpty: isSuccess && meals.length === 0,
    selectedDayIndex,
    selectedMealIndex,
    selectDay,
    selectMeal,
    toggleMealType,
  };
};
