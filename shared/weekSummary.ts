/**
 * The week summary Home opens on: how the household ate over its last cooking days.
 *
 * In `shared/` because the server derives every figure and the screen only draws them (ADR 0015):
 * the shape is the contract between the two, and the constants are the ones a reader of either
 * side needs to understand a number.
 */

import { MEAL_SLOTS, type MealSlot } from "./mealSlots";
import type { IngredientFacts } from "./nutrition";

/** How many cooking days a period holds. A day nothing was cooked on is skipped, not counted. */
export const PERIOD_DAYS = 7;

/** How many of the latest cooked plates the Progress tile draws a bar for. */
export const RECENT_SCORES = 7;

/**
 * The share of a day's intake lunch and dinner bring — the two meals Cuisko plans. Breakfast and a
 * snack bring the rest, which is why a plate is not measured against a whole day's needs.
 */
export const LUNCH_DINNER_SHARE = 0.7;

export const SUMMARY_NUTRIENTS = ["protein", "fat", "carbohydrates", "fiber", "iron"] as const;
export type SummaryNutrient = (typeof SUMMARY_NUTRIENTS)[number];

/**
 * The EU Reference Intakes for an adult, per day (Regulation 1169/2011, Annex XIII) — fiber from
 * EFSA, which the regulation does not set. Iron in milligrams, the rest in grams.
 */
export const DAILY_REFERENCE: Record<SummaryNutrient, number> = {
  iron: 14,
  fat: 70,
  protein: 50,
  fiber: 25,
  carbohydrates: 260,
};

/**
 * Nutrients whose figure stops at `CAP_VALUE`. Eating more protein or fiber than the reference is
 * not a fault, and a gauge far past its end would read as one (PRODUCT.md §1). Fat is left uncapped:
 * past the reference is the one thing this row exists to show.
 */
export const CAPPED_NUTRIENTS: readonly SummaryNutrient[] = ["iron", "protein", "fiber", "carbohydrates"];

/** Where a capped nutrient stops, in percent of its reference: a little past it, never far past. */
export const CAP_VALUE = 110;

export type WeekSummaryDish = {
  plateId: string;
  recipeId: string;
  title: string;
  imageUrl?: string;
  /** Absent when the recipe has no Nutri-Score to derive it from. */
  cuiScore?: number;
};

export type WeekSummary = {
  /** Cooking days found, at most `PERIOD_DAYS`. */
  days: number;
  /** Mean kilocalories per portion over the period. */
  caloriesPerPortion?: number;
  /** In `SUMMARY_NUTRIENTS` order; a nutrient no plate measured is left out rather than shown as 0. */
  nutrients: { key: SummaryNutrient; percent: number }[];
  /** `100 × this period's mean Cui-Score ÷ the previous one's`: above 100 is a better week. */
  progress?: number;
  /** Cui-Scores of the latest cooked plates, oldest first, at most `RECENT_SCORES`. */
  recentScores: number[];
  /** Mean overnight gap, dinner to the next day's lunch. */
  fastingHours?: number;
  /** Mean Cui-Score over the period. */
  health?: number;
  /** The period's plates, newest first. */
  dishes: WeekSummaryDish[];
};

/** One cooked plate, as `summarizeWeek` reads it: what the server already knows about it. */
export type SummaryPlate = WeekSummaryDish & {
  /** Local midnight of the day it was planned on. */
  date: number;
  slot: MealSlot;
  /** When it was ticked cooked: the only clock a plate carries. */
  updatedAt: number;
  /** What one portion holds — the recipe's total over its own servings. Absent when it cannot be weighed. */
  perServing?: IngredientFacts;
};

const HOUR = 3_600_000;
/** A local day is 23 to 25 hours long: a daylight-saving change adds or removes one. */
const LONGEST_DAY = 25 * HOUR;
const SHORTEST_DAY = 23 * HOUR;

const _mean = (values: number[]) =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

const _defined = <T>(values: (T | undefined)[]) => values.filter((value): value is T => value !== undefined);

/** Newest first: by day, then dinner before lunch, then the later tick. */
const _newestFirst = (a: SummaryPlate, b: SummaryPlate) =>
  b.date - a.date
  || MEAL_SLOTS.indexOf(b.slot) - MEAL_SLOTS.indexOf(a.slot)
  || b.updatedAt - a.updatedAt;

/**
 * One nutrient's mean per plate against what one of the two planned meals should bring. Plates
 * that did not measure it are left out of the mean rather than counted as zero.
 */
const _nutrientPercent = (plates: SummaryPlate[], key: SummaryNutrient) => {
  const mean = _mean(_defined(plates.map((plate) => plate.perServing?.[key])));
  if (mean === undefined) return undefined;

  const percent = (100 * mean) / ((DAILY_REFERENCE[key] * LUNCH_DINNER_SHARE) / 2);

  return CAPPED_NUTRIENTS.includes(key) ? Math.min(percent, CAP_VALUE) : percent;
};

/** Ticked cooked on the day it was planned for. A tick the next morning says nothing of when it was eaten. */
const _tickedSameDay = (plate: SummaryPlate) => plate.updatedAt >= plate.date && plate.updatedAt < plate.date + LONGEST_DAY;

/** The overnight gaps: a dinner, then the next calendar day's lunch, both ticked on their own day. */
const _overnightHours = (plates: SummaryPlate[]) => {
  const timed = plates.filter(_tickedSameDay);
  const lunches = timed.filter((plate) => plate.slot === "lunch");

  return timed
    .filter((plate) => plate.slot === "dinner")
    .flatMap((dinner) => {
      const lunch = lunches.find((candidate) => {
        const days = candidate.date - dinner.date;
        return days >= SHORTEST_DAY && days <= LONGEST_DAY;
      });
      const gap = lunch && lunch.updatedAt - dinner.updatedAt;

      return gap !== undefined && gap > 0 ? [gap / HOUR] : [];
    });
};

/**
 * The week summary, from the household's latest cooked plates.
 *
 * A period is `periodDays` **cooking** days, not calendar days: a day nothing was cooked on is
 * skipped and the next older one taken instead. The period before it, the same length, is read only
 * to say whether this one is better — so the caller passes enough plates to cover both
 * (two slots a day: `4 × periodDays` always does).
 *
 * @limitation Design choice, for now: a plate with no Cui-Score (its recipe has no Nutri-Score) is
 * left out of every score figure, and one that cannot be weighed out of every nutrition figure.
 *
 * @limitation Design choice, for now: fasting reads `updatedAt` as the time a plate was eaten, so
 * any write to a plate after it was ticked cooked moves its gap, or drops it once that write lands
 * on another day. A dedicated `cookedAt` would fix it.
 */
export const summarizeWeek = (plates: SummaryPlate[], periodDays: number = PERIOD_DAYS): WeekSummary => {
  const sorted = [...plates].sort(_newestFirst);
  const days = [...new Set(sorted.map((plate) => plate.date))];
  const currentDays = new Set(days.slice(0, periodDays));
  const previousDays = new Set(days.slice(periodDays, 2 * periodDays));

  const current = sorted.filter((plate) => currentDays.has(plate.date));
  const previous = sorted.filter((plate) => previousDays.has(plate.date));

  const health = _mean(_defined(current.map((plate) => plate.cuiScore)));
  const previousHealth = _mean(_defined(previous.map((plate) => plate.cuiScore)));

  const caloriesPerPortion = _mean(_defined(current.map((plate) => plate.perServing?.calories)));
  const fastingHours = _mean(_overnightHours(current));
  const progress = health !== undefined && previousHealth ? (100 * health) / previousHealth : undefined;

  return {
    days: currentDays.size,
    ...(caloriesPerPortion !== undefined && { caloriesPerPortion }),
    nutrients: SUMMARY_NUTRIENTS.flatMap((key) => {
      const percent = _nutrientPercent(current, key);
      return percent === undefined ? [] : [{ key, percent }];
    }),
    ...(progress !== undefined && { progress }),
    recentScores: _defined(sorted.map((plate) => plate.cuiScore)).slice(0, RECENT_SCORES).reverse(),
    ...(fastingHours !== undefined && { fastingHours }),
    ...(health !== undefined && { health }),
    dishes: current.map(({ plateId, recipeId, title, imageUrl, cuiScore }) => ({
      plateId,
      recipeId,
      title,
      ...(imageUrl !== undefined && { imageUrl }),
      ...(cuiScore !== undefined && { cuiScore }),
    })),
  };
};
