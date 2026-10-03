import { describe, expect, it } from "vitest";

import { toRecipeVerification } from "../verifyRecipe";

/**
 * The generation is a model call and is not tested here. What is tested is the boundary after it,
 * and the one property of it that matters most: an answer that says "nothing to fix", in any of
 * the ways a model spells it, must come out as `recipe: null` — the caller reads that as "do not
 * write", and anything else costs a rewrite of a correct recipe.
 */
const _recipe = (overrides: Record<string, unknown> = {}) => ({
  title: "Poulet frit",
  description: "Croustillant dehors, tendre dedans.",
  servings: 4,
  difficulty: 2,
  cuisine: "american",
  tags: [],
  equipments: [],
  timings: { preparation: 15, cooking: 20, resting: null },
  instructions: [{ title: null, steps: [{ instruction: "Faites frire le poulet", hints: [] }] }],
  ingredients: [
    { name: "blanc de poulet", quantity: 600, unit: "g", fatUse: null },
    { name: "huile de tournesol", quantity: 101.5, unit: "cl", fatUse: "deepFried" },
  ],
  ...overrides,
});

describe("toRecipeVerification", () => {
  it("reads nothing to fix as no recipe", () => {
    expect(toRecipeVerification({ corrections: [], recipe: null })).toEqual({ corrections: [], recipe: null });
  });

  it("reads a recipe spelled as a word for none as no recipe", () => {
    expect(toRecipeVerification({ corrections: [], recipe: "none" }).recipe).toBeNull();
  });

  it("returns a corrected recipe through the sanitize parser", () => {
    const corrections = ["Huile : 1 c. à soupe devient 101,5 cl, la friture manquait."];
    const verification = toRecipeVerification({ corrections, recipe: _recipe() });

    expect(verification.corrections).toEqual(corrections);
    // Normalised exactly as a sanitized recipe is: the null timing dropped, the null title gone.
    expect(verification.recipe?.timings).toEqual({ preparation: 15, cooking: 20 });
    expect(verification.recipe?.instructions).toEqual([{ steps: [{ instruction: "Faites frire le poulet", hints: [] }] }]);
    expect(verification.recipe?.ingredients[0]).toEqual({ name: "blanc de poulet", quantity: 600, unit: "g" });
  });

  it("keeps the fatUse a correction tagged on a frying fat", () => {
    const verification = toRecipeVerification({ corrections: ["La friture manquait."], recipe: _recipe() });

    expect(verification.recipe?.ingredients[1]).toEqual({
      name: "huile de tournesol",
      quantity: 101.5,
      unit: "cl",
      fatUse: "deepFried",
    });
  });

  it("refuses corrections that came with no recipe — it is a failed check, not a clean one", () => {
    expect(() => toRecipeVerification({ corrections: ["Oil was missing"], recipe: null })).toThrow();
  });

  it("reads a recipe that names no fault as nothing to fix — a rewrite must say what it fixed", () => {
    expect(toRecipeVerification({ corrections: [], recipe: _recipe() })).toEqual({ corrections: [], recipe: null });
  });

  it("refuses a corrected recipe the database could not store", () => {
    expect(() => toRecipeVerification({ corrections: ["x"], recipe: _recipe({ cuisine: "martian" }) })).toThrow();
  });
});
