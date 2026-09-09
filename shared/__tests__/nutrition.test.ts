import { describe, expect, test } from "vitest";

import { computeNutriScore, totalsOf, type IngredientFacts, type NutritionFacts } from "../nutrition";

const facts = (overrides: Partial<NutritionFacts> = {}): NutritionFacts => ({
  calories: 0,
  protein: 0,
  saturatedFat: 0,
  carbohydrates: 0,
  sugars: 0,
  fiber: 0,
  sodium: 0,
  ...overrides,
});

describe("computeNutriScore", () => {
  test("grades a raw vegetable A", () => {
    // Carrot, per 100g.
    const score = computeNutriScore(
      facts({ calories: 41, protein: 0.9, carbohydrates: 10, sugars: 4.7, fiber: 2.8, sodium: 69 }),
      100,
    );

    expect(score.grade).toBe("A");
  });

  // D, not E: the 2017 solid-food algorithm caps saturated fat at 10 points, so butter and lard
  // land in the same band. The 2023 revision scores added fats on a saturates/total-lipid ratio
  // and separates them — implement that here if a grade ever has to match a package label.
  test("grades butter D", () => {
    const score = computeNutriScore(
      facts({ calories: 717, protein: 0.9, saturatedFat: 51, carbohydrates: 0.1, sugars: 0.1, sodium: 11 }),
      0,
    );

    expect(score.grade).toBe("D");
  });

  test("withholds the protein offset from a high-negative food that is not mostly produce", () => {
    // 11+ negative points with a large protein figure — salami, roughly.
    const salami = facts({
      calories: 407, protein: 22, saturatedFat: 12.6, carbohydrates: 2.4, sugars: 0.6, sodium: 1740,
    });

    const withoutProduce = computeNutriScore(salami, 0);
    const asMostlyProduce = computeNutriScore(salami, 90);

    expect(withoutProduce.points).toBeGreaterThan(asMostlyProduce.points);
    expect(withoutProduce.grade).toBe("E");
  });

  test("scores beyond the last threshold row rather than capping at it", () => {
    // Salt: sodium far past the 900mg top row, so the table has to extrapolate.
    const score = computeNutriScore(facts({ sodium: 38758 }), 0);

    expect(score.points).toBe(10);
    expect(score.grade).toBe("C");
  });
});

/** A catalog ingredient with every fact recorded, so a test can drop one deliberately. */
const ingredient = (overrides: Partial<IngredientFacts> = {}): IngredientFacts => ({
  calories: 0,
  protein: 0,
  fat: 0,
  carbohydrates: 0,
  saturatedFat: 0,
  sugars: 0,
  fiber: 0,
  sodium: 0,
  ...overrides,
});

/** The worked example: carrots, onion and a spoon of oil, written for four. */
const CARROT = ingredient({ calories: 41, protein: 0.9, carbohydrates: 10, sugars: 4.7, fiber: 2.8, sodium: 69 });
const ONION = ingredient({ calories: 40, protein: 1.1, carbohydrates: 9.3, sugars: 4.2, fiber: 1.7, sodium: 4 });
const OIL = ingredient({ calories: 884, fat: 100, saturatedFat: 13.8 });

const DISH = [
  { facts: CARROT, grams: 500, produce: true },
  { facts: ONION, grams: 300, produce: true },
  { facts: OIL, grams: 13.65, produce: false },
];

describe("totalsOf", () => {
  test("sums each line at its own weight", () => {
    const nutrition = totalsOf(DISH, 4)!;

    expect(nutrition.grams).toBeCloseTo(813.65);
    // 205 from the carrots, 120 from the onion, 120.7 from the oil.
    expect(nutrition.total.calories).toBeCloseTo(445.7, 1);
  });

  test("divides by the servings the recipe was written for", () => {
    const nutrition = totalsOf(DISH, 4)!;

    expect(nutrition.perServing.calories).toBeCloseTo(nutrition.total.calories / 4);
    // What the ingredients tab shows once its stepper is moved from 4 to 6.
    expect(nutrition.perServing.calories * 6).toBeCloseTo(668.5, 1);
  });

  test("grades the dish per 100g of itself, not per serving", () => {
    const nutrition = totalsOf(DISH, 4)!;

    // 445.7 kcal spread over 813.65g is 54.8 per 100g — a serving is eight times that, and would
    // score several grades worse if the servings were mistaken for the denominator.
    expect(nutrition.nutriScore?.grade).toBe("A");
  });

  test("counts the produce share by weight, so a spoon of oil cannot outweigh the carrots", () => {
    const buttery = totalsOf(
      [
        { facts: CARROT, grams: 100, produce: true },
        { facts: OIL, grams: 200, produce: false },
      ],
      2,
    )!;

    expect(buttery.nutriScore!.points).toBeGreaterThan(totalsOf(DISH, 4)!.nutriScore!.points);
  });

  test("reports nothing at all when a line could not be weighed", () => {
    // The oil was written as "1 cs" and the catalog has no density for it.
    expect(totalsOf([...DISH.slice(0, 2), { facts: OIL, produce: false }], 4)).toBeUndefined();
  });

  test("keeps the macros but drops the score when a fact was never recorded", () => {
    const { sodium: _sodium, ...noSodium } = CARROT;
    const nutrition = totalsOf([{ facts: noSodium, grams: 500, produce: true }], 2)!;

    expect(nutrition.total.calories).toBeCloseTo(205);
    expect(nutrition.total.sodium).toBeUndefined();
    // Zero sodium is full marks for the fact nobody measured, so there is no grade to give.
    expect(nutrition.nutriScore).toBeUndefined();
  });

  test("has nothing to report for an empty recipe or a recipe for nobody", () => {
    expect(totalsOf([], 4)).toBeUndefined();
    expect(totalsOf(DISH, 0)).toBeUndefined();
  });

  /**
   * Iron behaves like the four Nutri-Score inputs on the way through — summed by weight, divided
   * into servings — and unlike them in one way that matters: the score does not read it, so a
   * recipe whose iron is unknown must still be graded. Both halves are pinned here because the two
   * are one `if` apart in `totalsOf`.
   */
  test("sums iron by weight and divides it into servings", () => {
    const beef = ingredient({ calories: 198, protein: 25.5, carbohydrates: 0, sugars: 0, fiber: 0, sodium: 58, iron: 2.55 });
    const nutrition = totalsOf([{ facts: beef, grams: 400, produce: false }], 2)!;

    // 2.55mg per 100g × 400g = 10.2mg, halved into two servings.
    expect(nutrition.total.iron).toBeCloseTo(10.2);
    expect(nutrition.perServing.iron).toBeCloseTo(5.1);
  });

  test("drops iron but keeps the grade when one line never recorded it", () => {
    const withIron = { ...CARROT, iron: 0.3 };
    const nutrition = totalsOf(
      [
        { facts: withIron, grams: 500, produce: true },
        // CIQUAL leaves iron unmeasured on 27 of the catalog's foods; this is one of them.
        { facts: ONION, grams: 300, produce: true },
      ],
      2,
    )!;

    expect(nutrition.total.iron).toBeUndefined();
    // The score reads seven facts and iron is not among them, so it survives the hole.
    expect(nutrition.nutriScore).toBeDefined();
  });
});
