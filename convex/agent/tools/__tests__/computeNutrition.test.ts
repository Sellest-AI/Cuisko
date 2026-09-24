import { describe, expect, it } from "vitest";

import type { NutritionFigures } from "@convex/functions/recipes/computeNutrition";

import { toNutritionOutput } from "../computeNutrition";

const _figures: NutritionFigures = {
  servings: 1,
  grams: 50,
  total: { calories: 70, protein: 6, fat: 5, carbohydrates: 1 },
  perServing: { calories: 70, protein: 6, fat: 5, carbohydrates: 1 },
  per100g: { calories: 140, protein: 12, fat: 10, carbohydrates: 2 },
  lines: [],
};

/**
 * The rule the calculator hangs on: a figure the model reads is complete, or it is an error the
 * model acts on. Which ids are missing and which units refuse is the query's question, pinned in
 * `functions/recipes/__tests__/computeNutrition.test.ts`.
 */
describe("toNutritionOutput", () => {
  it("hands back the figures of lines that all weighed", () => {
    expect(toNutritionOutput({ kind: "lines", missing: [], unweighable: [], figures: _figures })).toEqual({
      lines: _figures,
    });
  });

  it("hands back recipes, including one marked unavailable", () => {
    const recipes = [{ id: "r1", title: "Soupe", unavailable: "no total" }];

    expect(toNutritionOutput({ kind: "recipes", missing: [], recipes })).toEqual({ recipes });
  });

  /** ADR 0010: never dropped, always named, so the model can fix the one it mangled. */
  it("throws on an id that is not a row, naming it", () => {
    expect(() => toNutritionOutput({ kind: "recipes", missing: ["bad-id"], recipes: [] })).toThrow(/bad-id/);
    expect(() =>
      toNutritionOutput({ kind: "lines", missing: ["bad-id"], unweighable: [], figures: _figures }),
    ).toThrow(/bad-id/);
  });

  it("throws on a unit the ingredient cannot be weighed in, naming the units it can", () => {
    const answer = {
      kind: "lines" as const,
      missing: [],
      unweighable: [{ ingredientId: "i1", name: "oeuf", unit: "ml" as const, units: ["g" as const, "pcs" as const] }],
    };

    expect(() => toNutritionOutput(answer)).toThrow("oeuf cannot be weighed in ml; use one of g, pcs");
  });

  it("throws rather than answering zero for lines that weigh nothing", () => {
    expect(() => toNutritionOutput({ kind: "lines", missing: [], unweighable: [] })).toThrow();
  });
});
