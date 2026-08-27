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

/**
 * What the catalog knows about one ingredient, per 100g.
 *
 * The four optional ones are optional on the table too, and only the Nutri-Score needs them —
 * a recipe still reports its macros without them, it just cannot be graded.
 */
export type IngredientFacts = {
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
  saturatedFat?: number;
  sugars?: number;
  fiber?: number;
  sodium?: number;
};

/** One line of a recipe, already weighed by `toGrams` and already looked up in the catalog. */
export type RecipeLine = {
  facts: IngredientFacts;
  /** `undefined` when the line's unit could not be converted — see `toGrams`. */
  grams?: number;
  /**
   * Whether this line counts toward the fruit/vegetable/legume/nut share the score rewards.
   *
   * A boolean rather than the ingredient's category, because the category vocabulary lives in the
   * schema and this file sits underneath it — `convex/` imports `shared/`, never the other way.
   */
  produce: boolean;
};

export type RecipeNutrition = {
  /** What the whole recipe weighs. The denominator behind every per-100g figure below. */
  grams: number;
  /** Everything the recipe contains, across all of the servings it is written for. */
  total: IngredientFacts;
  /** `total` divided by the recipe's own servings — the figure a screen shows, times its stepper. */
  perServing: IngredientFacts;
  /** Absent unless every line carried all four of the optional facts. */
  nutriScore?: NutriScore;
};

type WeighedLine = RecipeLine & { grams: number };

const sumRequired = (lines: WeighedLine[], pick: (facts: IngredientFacts) => number) =>
  lines.reduce((total, line) => total + pick(line.facts) * (line.grams / 100), 0);

/** `undefined` as soon as one line omits the fact — a missing value is not a zero. */
const sumOptional = (lines: WeighedLine[], pick: (facts: IngredientFacts) => number | undefined) => {
  let total = 0;

  for (const line of lines) {
    const value = pick(line.facts);
    if (value === undefined) return undefined;
    total += value * (line.grams / 100);
  }

  return total;
};

/**
 * Every fact multiplied, the optional ones staying optional.
 *
 * Exported because the same operation is needed on the way back out: `totalsOf` divides a total
 * into portions here, and a screen cooking for more people than the recipe was written for
 * multiplies the total back up. Two copies of an eight-field multiply agree only until somebody
 * adds a ninth fact to one of them.
 */
export const scaleFacts = (facts: IngredientFacts, factor: number): IngredientFacts => ({
  calories: facts.calories * factor,
  protein: facts.protein * factor,
  fat: facts.fat * factor,
  carbohydrates: facts.carbohydrates * factor,
  ...(facts.saturatedFat !== undefined && { saturatedFat: facts.saturatedFat * factor }),
  ...(facts.sugars !== undefined && { sugars: facts.sugars * factor }),
  ...(facts.fiber !== undefined && { fiber: facts.fiber * factor }),
  ...(facts.sodium !== undefined && { sodium: facts.sodium * factor }),
});

/**
 * What a recipe adds up to, from its lines and the servings it was written for.
 *
 * All of it or none of it: one line that could not be weighed returns `undefined` rather than a
 * total missing that ingredient. A partial figure is worse than no figure here, because nothing
 * downstream can tell the two apart — a dish quietly missing its olive oil reads as a health food.
 *
 * The Nutri-Score degrades separately, because it fails for a different reason: the macros are
 * there, but one ingredient never recorded its sodium, and treating that as zero would hand the
 * dish full marks for the fact nobody measured.
 */
export const totalsOf = (lines: RecipeLine[], servings: number): RecipeNutrition | undefined => {
  if (lines.length === 0 || servings <= 0) return undefined;
  if (lines.some((line) => line.grams === undefined)) return undefined;

  const weighed = lines as WeighedLine[];
  const grams = weighed.reduce((total, line) => total + line.grams, 0);

  // Everything below divides by it, and a recipe of nothing has no nutrition to report anyway.
  if (grams <= 0) return undefined;

  const saturatedFat = sumOptional(weighed, (facts) => facts.saturatedFat);
  const sugars = sumOptional(weighed, (facts) => facts.sugars);
  const fiber = sumOptional(weighed, (facts) => facts.fiber);
  const sodium = sumOptional(weighed, (facts) => facts.sodium);

  const total: IngredientFacts = {
    calories: sumRequired(weighed, (facts) => facts.calories),
    protein: sumRequired(weighed, (facts) => facts.protein),
    fat: sumRequired(weighed, (facts) => facts.fat),
    carbohydrates: sumRequired(weighed, (facts) => facts.carbohydrates),
    ...(saturatedFat !== undefined && { saturatedFat }),
    ...(sugars !== undefined && { sugars }),
    ...(fiber !== undefined && { fiber }),
    ...(sodium !== undefined && { sodium }),
  };

  const nutrition: RecipeNutrition = {
    grams,
    total,
    perServing: scaleFacts(total, 1 / servings),
  };

  if (saturatedFat === undefined || sugars === undefined || fiber === undefined || sodium === undefined) {
    return nutrition;
  }

  /**
   * The score reads the finished dish as if it were a product on a shelf, so the facts are
   * per 100g of the whole thing — not per serving, and never an average of the ingredients own
   * grades, which would let a spoonful of oil weigh as much as half a kilo of carrots.
   */
  const ratio = 100 / grams;
  const produceGrams = weighed
    .filter((line) => line.produce)
    .reduce((produce, line) => produce + line.grams, 0);

  return {
    ...nutrition,
    nutriScore: computeNutriScore(
      {
        calories: total.calories * ratio,
        protein: total.protein * ratio,
        saturatedFat: saturatedFat * ratio,
        carbohydrates: total.carbohydrates * ratio,
        sugars: sugars * ratio,
        fiber: fiber * ratio,
        sodium: sodium * ratio,
      },
      (produceGrams / grams) * 100,
    ),
  };
};
