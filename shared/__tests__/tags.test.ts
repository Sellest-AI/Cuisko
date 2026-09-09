import { describe, expect, test } from "vitest";

import type { Diet } from "../diets";
import { COMPUTED_TAGS, allergenTagsOf, dietTagsOf, facetsOf, nutritionTagsOf } from "../tags";
import type { Tag } from "../tags";

describe("dietTagsOf", () => {
  test("calls a recipe of plants all three, because the suitability nests", () => {
    expect(dietTagsOf(["vegan", "vegan"])).toEqual(["pescatarian", "vegetarian", "vegan"]);
  });

  test("drops vegan alone when a line is animal-derived but not flesh", () => {
    expect(dietTagsOf(["vegan", "vegetarian"])).toEqual(["pescatarian", "vegetarian"]);
  });

  test("keeps only pescatarian when the recipe contains seafood", () => {
    expect(dietTagsOf(["vegan", "pescatarian"])).toEqual(["pescatarian"]);
  });

  test("claims nothing for a recipe containing meat", () => {
    expect(dietTagsOf(["vegan", "omnivore"])).toEqual([]);
  });

  /** Meat outranks everything: a surf-and-turf is not pescatarian. */
  test("claims nothing when meat and seafood appear together", () => {
    expect(dietTagsOf(["omnivore", "pescatarian"])).toEqual([]);
  });

  /** The whole point of the field: none of these three is legible from `category`. */
  test.each<[string, Diet, string[]]>([
    ["honey, a SWEETENER", "vegetarian", ["pescatarian", "vegetarian"]],
    ["fish sauce, a CONDIMENT", "pescatarian", ["pescatarian"]],
    ["gelatin, an OTHER", "omnivore", []],
  ])("refuses the plant answer for %s", (_, diet, expected) => {
    expect(dietTagsOf(["vegan", "vegan", diet])).toEqual(expected);
  });

  /** The order of the lines is not the answer — the answer is the maximum over them. */
  test("does not depend on where the permissive line sits", () => {
    expect(dietTagsOf(["omnivore", "vegan"])).toEqual(dietTagsOf(["vegan", "omnivore"]));
  });

  /**
   * Vacuously true, and the caller is what stops it mattering: `computeTags` refuses to compute
   * at all unless every line resolved, so an empty list never reaches here from a real recipe.
   */
  test("treats no lines as containing nothing", () => {
    expect(dietTagsOf([])).toEqual(["pescatarian", "vegetarian", "vegan"]);
  });

  test("only ever answers with tags from the computed vocabulary", () => {
    for (const tag of dietTagsOf(["vegan"])) expect(COMPUTED_TAGS).toContain(tag);
  });
});

describe("allergenTagsOf", () => {
  test("awards all three when nothing is carried", () => {
    expect(allergenTagsOf([])).toEqual(["gluten-free", "dairy-free", "nut-free"]);
  });

  test("withholds only the tag the allergen speaks to", () => {
    expect(allergenTagsOf(["gluten"])).toEqual(["dairy-free", "nut-free"]);
    expect(allergenTagsOf(["milk"])).toEqual(["gluten-free", "nut-free"]);
  });

  /** Two allergens, one tag: a peanut is a legume, and neither may pass as nut-free. */
  test.each(["nuts", "peanuts"] as const)("withholds nut-free for %s alone", (allergen) => {
    expect(allergenTagsOf([allergen])).not.toContain("nut-free");
  });

  test("withholds nut-free once for both together", () => {
    expect(allergenTagsOf(["nuts", "peanuts"])).toEqual(["gluten-free", "dairy-free"]);
  });

  /** Ten of the fourteen have no tag reading them yet, and must not silently suppress one. */
  test("ignores an allergen no tag is about", () => {
    expect(allergenTagsOf(["celery", "sulphites", "mustard"])).toEqual([
      "gluten-free",
      "dairy-free",
      "nut-free",
    ]);
  });

  test("claims nothing when everything is carried", () => {
    expect(allergenTagsOf(["gluten", "milk", "nuts", "peanuts"])).toEqual([]);
  });

  test("only ever answers with tags from the computed vocabulary", () => {
    for (const tag of allergenTagsOf([])) expect(COMPUTED_TAGS).toContain(tag);
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

  test("calls a serving low-calorie at or under 500 kcal", () => {
    expect(nutritionTagsOf({ calories: 500, protein: 5, carbohydrates: 80 })).toContain(
      "low-calorie",
    );
    expect(nutritionTagsOf({ calories: 501, protein: 5, carbohydrates: 80 })).not.toContain(
      "low-calorie",
    );
  });

  test("calls a serving high-calorie at or over 850 kcal", () => {
    expect(nutritionTagsOf({ calories: 850, protein: 10, carbohydrates: 200 })).toContain(
      "high-calorie",
    );
    expect(nutritionTagsOf({ calories: 849, protein: 10, carbohydrates: 200 })).not.toContain(
      "high-calorie",
    );
  });

  /**
   * EU Regulation 1924/2006 allows "high fibre" at 3g per 100 kcal, which is the limb used — the
   * per-100g limb needs a figure for what the dish weighs, and `ServingFacts` does not carry one.
   */
  test("calls a serving high-fibre at or over 3g per 100 kcal", () => {
    // 12g over 400 kcal = 3g/100kcal exactly. The claim is "at least", so the boundary counts.
    expect(nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 50, fiber: 12 })).toContain(
      "high-fibre",
    );
    expect(
      nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 50, fiber: 11.9 }),
    ).not.toContain("high-fibre");
  });

  /** 30% of the 14mg NRV in Annex XIII, per serving. */
  test("calls a serving iron-rich at or over 4.2mg", () => {
    expect(nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 50, iron: 4.2 })).toContain(
      "iron-rich",
    );
    expect(nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 50, iron: 4.19 })).not.toContain(
      "iron-rich",
    );
  });

  /**
   * The refusal that matters more than either threshold, and the reason both facts are optional all
   * the way from `IngredientFacts` to here: a recipe whose fibre nobody measured is not a recipe
   * without fibre. Reading `undefined` as zero would turn "we did not look" into a claim, which is
   * the failure `allergenTagsOf` exists to avoid on the other half of the vocabulary.
   */
  test("withholds both rather than reading an unmeasured fact as zero", () => {
    const unmeasured = nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 50 });

    expect(unmeasured).not.toContain("high-fibre");
    expect(unmeasured).not.toContain("iron-rich");
  });

  /** Zero measured IS a claim, and the opposite one — it must not be confused with absence above. */
  test("reads a measured zero as measured, not as unknown", () => {
    const tags = nutritionTagsOf({ calories: 400, protein: 5, carbohydrates: 50, fiber: 0, iron: 0 });

    expect(tags).not.toContain("high-fibre");
    expect(tags).not.toContain("iron-rich");
  });

  /**
   * The 350 kcal between the two thresholds is what makes this arithmetic rather than a rule
   * somebody has to remember, so it is pinned across the whole range rather than at the boundary:
   * a threshold edited into an overlap fails here, in the file that documents why it must not.
   */
  test.each([0, 1, 500, 501, 849, 850, 1200, 5000])(
    "never awards both calorie tags, at %i kcal",
    (calories) => {
      const tags = nutritionTagsOf({ calories, protein: 10, carbohydrates: 40 });
      expect(tags.includes("low-calorie") && tags.includes("high-calorie")).toBe(false);
    },
  );

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

describe("facetsOf", () => {
  const ALL_FALSE = {
    isVegan: false,
    isVegetarian: false,
    isPescatarian: false,
    isGlutenFree: false,
    isDairyFree: false,
    isNutFree: false,
  };

  test("claims nothing for a recipe with no computed tags", () => {
    expect(facetsOf(["main", "quick"])).toEqual(ALL_FALSE);
  });

  /**
   * The projection must agree with the array it came from, tag for tag — that agreement is the
   * whole reason the booleans are computed from the finished list rather than derived a second
   * time from the ingredients.
   */
  test.each<[Tag, keyof typeof ALL_FALSE]>([
    ["vegan", "isVegan"],
    ["vegetarian", "isVegetarian"],
    ["pescatarian", "isPescatarian"],
    ["gluten-free", "isGlutenFree"],
    ["dairy-free", "isDairyFree"],
    ["nut-free", "isNutFree"],
  ])("sets %s's facet and no other", (tag, facet) => {
    expect(facetsOf([tag])).toEqual({ ...ALL_FALSE, [facet]: true });
  });

  /** The nesting survives the projection: a vegan recipe answers a vegetarian filter. */
  test("carries all three diet facets for a recipe tagged vegan by dietTagsOf", () => {
    const facets = facetsOf(dietTagsOf(["vegan"]));

    expect(facets.isVegan).toBe(true);
    expect(facets.isVegetarian).toBe(true);
    expect(facets.isPescatarian).toBe(true);
  });

  test("ignores authored tags entirely", () => {
    expect(facetsOf(["soup", "comfort-food", "festive"])).toEqual(ALL_FALSE);
  });

  /** `false` is "not claimed", never "contains it" — the filter simply does not surface the row. */
  test("answers all false for no tags at all", () => {
    expect(facetsOf([])).toEqual(ALL_FALSE);
  });
});
