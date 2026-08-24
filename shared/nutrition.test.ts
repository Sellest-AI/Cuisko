import { describe, expect, test } from "vitest";

import { computeNutriScore, type NutritionFacts } from "./nutrition";

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
