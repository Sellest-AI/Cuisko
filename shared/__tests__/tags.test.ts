import { describe, expect, test } from "vitest";

import { COMPUTED_TAGS, dietTagsOf, nutritionTagsOf, type DietLine } from "../tags";

const NEUTRAL: DietLine = { meat: false, seafood: false, fromAnimal: false };

const line = (over: Partial<DietLine> = {}): DietLine => ({ ...NEUTRAL, ...over });

describe("dietTagsOf", () => {
  test("calls a recipe of plants all three, because the suitability nests", () => {
    expect(dietTagsOf([line(), line()])).toEqual(["pescatarian", "vegetarian", "vegan"]);
  });

  test("drops vegan alone when a line is animal-derived but not flesh", () => {
    expect(dietTagsOf([line(), line({ fromAnimal: true })])).toEqual([
      "pescatarian",
      "vegetarian",
    ]);
  });

  test("keeps only pescatarian when the recipe contains seafood", () => {
    expect(dietTagsOf([line(), line({ seafood: true })])).toEqual(["pescatarian"]);
  });

  test("claims nothing for a recipe containing meat", () => {
    expect(dietTagsOf([line(), line({ meat: true })])).toEqual([]);
  });

  /** Meat outranks everything: a surf-and-turf is not pescatarian. */
  test("claims nothing when meat and seafood appear together", () => {
    expect(dietTagsOf([line({ meat: true }), line({ seafood: true })])).toEqual([]);
  });

  /**
   * Vacuously true, and the caller is what stops it mattering: `computeTags` refuses to compute
   * at all unless every line resolved, so an empty list never reaches here from a real recipe.
   */
  test("treats no lines as containing nothing", () => {
    expect(dietTagsOf([])).toEqual(["pescatarian", "vegetarian", "vegan"]);
  });

  test("only ever answers with tags from the computed vocabulary", () => {
    for (const tag of dietTagsOf([line()])) expect(COMPUTED_TAGS).toContain(tag);
  });
});

describe("nutritionTagsOf", () => {
  /** 30g protein × 4 = 120 kcal of 400 = 30%, over the 20% claim. */
  test("calls a serving high-protein at or above a fifth of its energy", () => {
    expect(nutritionTagsOf({ calories: 400, protein: 30, carbohydrates: 10 })).toContain(
      "high-protein",
    );
  });

  test("does not call a serving high-protein just below the share", () => {
    // 19g × 4 = 76 kcal of 400 = 19%.
    expect(nutritionTagsOf({ calories: 400, protein: 19, carbohydrates: 90 })).not.toContain(
      "high-protein",
    );
  });

  /** Exactly 20% — the claim is "at least", so the boundary counts. */
  test("includes the high-protein boundary itself", () => {
    expect(nutritionTagsOf({ calories: 400, protein: 20, carbohydrates: 90 })).toContain(
      "high-protein",
    );
  });

  test("calls a serving low-carb at or under 26% of its energy", () => {
    // 26g × 4 = 104 kcal of 400 = 26%.
    expect(nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 26 })).toContain("low-carb");
  });

  test("does not call a pasta plate low-carb", () => {
    expect(nutritionTagsOf({ calories: 600, protein: 20, carbohydrates: 100 })).not.toContain(
      "low-carb",
    );
  });

  test("calls a serving low-calorie at or under 400 kcal", () => {
    expect(nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 80 })).toContain(
      "low-calorie",
    );
    expect(nutritionTagsOf({ calories: 401, protein: 5, carbohydrates: 80 })).not.toContain(
      "low-calorie",
    );
  });

  /** A share of zero is a division by zero, not a health claim. */
  test("answers nothing for a serving with no calories", () => {
    expect(nutritionTagsOf({ calories: 0, protein: 0, carbohydrates: 0 })).toEqual([]);
  });

  test("can award all three at once", () => {
    expect(nutritionTagsOf({ calories: 300, protein: 30, carbohydrates: 15 })).toEqual([
      "high-protein",
      "low-carb",
      "low-calorie",
    ]);
  });
});
