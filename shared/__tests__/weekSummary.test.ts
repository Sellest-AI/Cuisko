import { describe, expect, test } from "vitest";

import type { IngredientFacts } from "../nutrition";
import { summarizeWeek, type SummaryPlate } from "../weekSummary";

const HOUR = 3_600_000;

/** Local midnight of 1 October 2026 plus `offset` days: the day a plate is planned on. */
const day = (offset: number) => new Date(2026, 9, 1 + offset).getTime();

const facts = (overrides: Partial<IngredientFacts> = {}): IngredientFacts => ({
  calories: 600,
  protein: 20,
  fat: 20,
  carbohydrates: 60,
  fiber: 5,
  iron: 2,
  ...overrides,
});

let _next = 0;

/** A plate cooked on `date`, ticked at noon for lunch and at 20:00 for dinner unless told otherwise. */
const plate = (date: number, slot: SummaryPlate["slot"], overrides: Partial<SummaryPlate> = {}): SummaryPlate => ({
  plateId: `plate-${++_next}`,
  recipeId: "recipe-omelette",
  title: "Omelette",
  date,
  slot,
  updatedAt: date + (slot === "lunch" ? 12 : 20) * HOUR,
  cuiScore: 80,
  perServing: facts(),
  ...overrides,
});

/** Lunch and dinner on each of the `count` days ending at `last`. */
const fullDays = (last: number, count: number, overrides: Partial<SummaryPlate> = {}) =>
  Array.from({ length: count }, (_, index) => [
    plate(day(last - index), "lunch", overrides),
    plate(day(last - index), "dinner", overrides),
  ]).flat();

describe("summarizeWeek — the period", () => {
  test("a day nothing was cooked on is skipped and the next older day taken instead", () => {
    // Cooked every day from 1 to 8, except the 5th: the period reaches back to the 1st.
    const plates = [0, 1, 2, 3, 5, 6, 7].map((offset) => plate(day(offset), "dinner"));

    const summary = summarizeWeek(plates);

    expect(summary.days).toBe(7);
    expect(summary.dishes).toHaveLength(7);
  });

  test("an empty today does not shorten the period: it is the 7 cooking days before it", () => {
    const summary = summarizeWeek(fullDays(-1, 7));

    expect(summary.days).toBe(7);
    expect(summary.dishes).toHaveLength(14);
  });

  test("the period holds 7 days and the older plates only feed Progress", () => {
    const thisWeek = fullDays(0, 7);
    const summary = summarizeWeek([...thisWeek, ...fullDays(-7, 7)]);

    expect(summary.days).toBe(7);
    expect(summary.dishes.map((dish) => dish.plateId).sort())
      .toEqual(thisWeek.map((cooked) => cooked.plateId).sort());
  });

  test("dishes are listed newest first, dinner before lunch", () => {
    const lunch = plate(day(0), "lunch");
    const dinner = plate(day(0), "dinner");
    const yesterday = plate(day(-1), "dinner");

    expect(summarizeWeek([yesterday, lunch, dinner]).dishes.map((dish) => dish.plateId))
      .toEqual([dinner.plateId, lunch.plateId, yesterday.plateId]);
  });
});

describe("summarizeWeek — nutrition", () => {
  test("calories are the mean per portion over the period's plates", () => {
    const plates = [
      plate(day(0), "lunch", { perServing: facts({ calories: 500 }) }),
      plate(day(0), "dinner", { perServing: facts({ calories: 900 }) }),
      plate(day(-1), "dinner", { perServing: facts({ calories: 700 }) }),
    ];

    expect(summarizeWeek(plates).caloriesPerPortion).toBe(700);
  });

  test("a nutrient is the mean per meal against half of lunch and dinner's share of the day", () => {
    // Days [2, 1, 0, 2]: five plates, the empty day skipped. Fat 14, 14, 21, 35, 38.5 g → 24.5 g a
    // meal, against 70 g × 0.7 ÷ 2 = 24.5 g.
    const fat = [14, 14, 21, 35, 38.5];
    const plates = [
      plate(day(0), "lunch", { perServing: facts({ fat: fat[0] }) }),
      plate(day(0), "dinner", { perServing: facts({ fat: fat[1] }) }),
      plate(day(-1), "dinner", { perServing: facts({ fat: fat[2] }) }),
      plate(day(-3), "lunch", { perServing: facts({ fat: fat[3] }) }),
      plate(day(-3), "dinner", { perServing: facts({ fat: fat[4] }) }),
    ];

    expect(summarizeWeek(plates).nutrients.find((nutrient) => nutrient.key === "fat")?.percent).toBeCloseTo(100);
  });

  test("protein stops at 110%, fat does not", () => {
    const summary = summarizeWeek([plate(day(0), "dinner", { perServing: facts({ protein: 80, fat: 70 }) })]);

    expect(summary.nutrients.find((nutrient) => nutrient.key === "protein")?.percent).toBe(110);
    expect(summary.nutrients.find((nutrient) => nutrient.key === "fat")?.percent).toBeCloseTo(285.7, 1);
  });

  test("a nutrient no plate measured is left out rather than shown as 0", () => {
    const summary = summarizeWeek([plate(day(0), "dinner", { perServing: facts({ iron: undefined }) })]);

    expect(summary.nutrients.map((nutrient) => nutrient.key)).toEqual(["protein", "fat", "carbohydrates", "fiber"]);
  });

  test("a plate that cannot be weighed is left out of the nutrition, not counted as zero", () => {
    const plates = [
      plate(day(0), "lunch", { perServing: facts({ calories: 800 }) }),
      plate(day(0), "dinner", { perServing: undefined }),
    ];

    expect(summarizeWeek(plates).caloriesPerPortion).toBe(800);
  });
});

describe("summarizeWeek — scores", () => {
  test("health is the period's mean Cui-Score, an ungraded plate left out", () => {
    const plates = [
      plate(day(0), "lunch", { cuiScore: 60 }),
      plate(day(0), "dinner", { cuiScore: undefined }),
      plate(day(-1), "dinner", { cuiScore: 80 }),
    ];

    expect(summarizeWeek(plates).health).toBe(70);
  });

  test("progress is 100 when the period matches the one before", () => {
    expect(summarizeWeek([...fullDays(0, 7), ...fullDays(-7, 7)]).progress).toBe(100);
  });

  test("progress rises above 100 for a better period and falls below for a worse one", () => {
    const better = summarizeWeek([...fullDays(0, 7, { cuiScore: 80 }), ...fullDays(-7, 7, { cuiScore: 64 })]);
    const worse = summarizeWeek([...fullDays(0, 7, { cuiScore: 64 }), ...fullDays(-7, 7, { cuiScore: 80 })]);

    expect(better.progress).toBe(125);
    expect(worse.progress).toBe(80);
  });

  test("no previous period, no progress", () => {
    expect(summarizeWeek(fullDays(0, 7)).progress).toBeUndefined();
  });

  test("the bars are the last 7 graded plates, oldest first", () => {
    const plates = Array.from({ length: 12 }, (_, index) =>
      plate(day(-index), "dinner", { cuiScore: 50 + index }));

    expect(summarizeWeek(plates).recentScores).toEqual([56, 55, 54, 53, 52, 51, 50]);
  });
});

describe("summarizeWeek — fasting", () => {
  test("the mean gap from a dinner to the next day's lunch", () => {
    const plates = [
      plate(day(-2), "dinner", { updatedAt: day(-2) + 20 * HOUR }),
      plate(day(-1), "lunch", { updatedAt: day(-1) + 12 * HOUR }),
      plate(day(-1), "dinner", { updatedAt: day(-1) + 19 * HOUR }),
      plate(day(0), "lunch", { updatedAt: day(0) + 13 * HOUR }),
    ];

    // 16 h, then 18 h.
    expect(summarizeWeek(plates).fastingHours).toBe(17);
  });

  test("a plate ticked cooked the next day is not a time it was eaten", () => {
    const plates = [
      plate(day(-1), "dinner", { updatedAt: day(0) + 9 * HOUR }),
      plate(day(0), "lunch"),
    ];

    expect(summarizeWeek(plates).fastingHours).toBeUndefined();
  });

  test("a dinner and a lunch two days apart are not a night", () => {
    // Nothing cooked on the 30th: the period skips it, the fast does not.
    const plates = [plate(day(-2), "dinner"), plate(day(0), "lunch")];

    expect(summarizeWeek(plates).fastingHours).toBeUndefined();
  });
});
