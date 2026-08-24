/**
 * Nutri-Score — the 2017 French "solid foods" algorithm.
 *
 * Shared rather than convex-only because a score should render the same way everywhere it is
 * shown, and a second implementation of the point tables is how the grade and the facts behind it
 * drift apart. Pure by construction: it takes the facts a caller already has and returns a grade,
 * with no idea where either come from.
 *
 * The official algorithm scores a fourth input — the share of the product that is fruit,
 * vegetable, legume or nut — that a caller must supply. Cuisko's ingredient catalog does not
 * measure that per ingredient, so `convex/functions/ingredients/seedIngredients.ts` estimates it
 * from `category` before calling this.
 */

export type NutritionFacts = {
  /** kcal per 100g. */
  calories: number;
  /** grams per 100g. */
  protein: number;
  /** grams per 100g. */
  saturatedFat: number;
  /** grams per 100g. */
  carbohydrates: number;
  /** grams per 100g. */
  sugars: number;
  /** grams per 100g, AOAC method. */
  fiber: number;
  /** milligrams per 100g. */
  sodium: number;
};

export const NUTRI_SCORE_GRADES = ["A", "B", "C", "D", "E"] as const;
export type NutriScoreGrade = (typeof NUTRI_SCORE_GRADES)[number];
export type NutriScore = { grade: NutriScoreGrade; points: number };

const KCAL_TO_KJ = 4.184;

/** Steps down a table of `[upperBound, points]` pairs, returning the last one the value clears. */
const stepPoints = (value: number, thresholds: [number, number][]) => {
  for (const [upperBound, points] of thresholds) {
    if (value <= upperBound) return points;
  }
  return thresholds[thresholds.length - 1]![1] + 1;
};

const energyPoints = (kj: number) =>
  stepPoints(kj, [
    [335, 0], [670, 1], [1005, 2], [1340, 3], [1675, 4],
    [2010, 5], [2345, 6], [2680, 7], [3015, 8], [3350, 9],
  ]);

const saturatedFatPoints = (grams: number) =>
  stepPoints(grams, [
    [1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7], [9, 8], [10, 9],
  ]);

const sugarPoints = (grams: number) =>
  stepPoints(grams, [
    [4.5, 0], [9, 1], [13.5, 2], [18, 3], [22.5, 4],
    [27, 5], [31, 6], [36, 7], [40, 8], [45, 9],
  ]);

const sodiumPoints = (milligrams: number) =>
  stepPoints(milligrams, [
    [90, 0], [180, 1], [270, 2], [360, 3], [450, 4],
    [540, 5], [630, 6], [720, 7], [810, 8], [900, 9],
  ]);

const fiberPoints = (grams: number) =>
  stepPoints(grams, [[0.9, 0], [1.9, 1], [2.8, 2], [3.7, 3], [4.7, 4]]);

const proteinPoints = (grams: number) =>
  stepPoints(grams, [[1.6, 0], [3.2, 1], [4.8, 2], [6.4, 3], [8, 4]]);

/** The official table skips 3 and 4 — a product is either mostly produce or it is not. */
const fruitVegLegumePoints = (percent: number) => {
  if (percent > 80) return 5;
  if (percent > 60) return 2;
  if (percent > 40) return 1;
  return 0;
};

const gradeOf = (score: number): NutriScoreGrade => {
  if (score <= -1) return "A";
  if (score <= 2) return "B";
  if (score <= 10) return "C";
  if (score <= 18) return "D";
  return "E";
};

/**
 * `fruitVegLegumePercent` is 0-100: the share of the ingredient, by weight, that is fruit,
 * vegetable, legume or nut — the one input the official algorithm measures directly and this
 * catalog estimates instead.
 */
export const computeNutriScore = (
  facts: NutritionFacts,
  fruitVegLegumePercent: number,
): NutriScore => {
  const energy = energyPoints(facts.calories * KCAL_TO_KJ);
  const satFat = saturatedFatPoints(facts.saturatedFat);
  const sugar = sugarPoints(facts.sugars);
  const sodium = sodiumPoints(facts.sodium);
  const negative = energy + satFat + sugar + sodium;

  const fiber = fiberPoints(facts.fiber);
  const protein = proteinPoints(facts.protein);
  const fruitVeg = fruitVegLegumePoints(fruitVegLegumePercent);

  // Above 11 negative points, protein no longer offsets the score unless the product is mostly
  // produce — otherwise a food dense enough in sugar/fat/sodium/energy could buy back a good grade
  // on protein content alone.
  const points =
    negative >= 11 && fruitVeg < 5 ? negative - fiber - fruitVeg : negative - (fiber + protein + fruitVeg);

  return { grade: gradeOf(points), points };
};
