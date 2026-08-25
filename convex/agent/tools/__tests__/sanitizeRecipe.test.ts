import { describe, expect, it } from "vitest";

import { toSanitizedRecipe } from "../sanitizeRecipe";

/**
 * The generation itself is not tested here — it is a model call. What is tested is the boundary
 * right after it, where a valid-looking answer becomes a wrong recipe: the model writes the *word*
 * for absent instead of the value, and a word passes every schema.
 */
const _answer = (overrides: Record<string, unknown> = {}) => ({
  title: "Carbonara",
  description: "Pasta, egg and pork, in the time the water takes to boil.",
  servings: 2,
  difficulty: 2,
  cuisine: "italian",
  tags: [],
  equipments: [],
  timings: { preparation: 5, cooking: 15, resting: null },
  instructions: [{ title: null, steps: ["Boil the water"] }],
  ingredients: [{ name: "spaghetti", quantity: 200, unit: "g" }],
  ...overrides,
});

describe("toSanitizedRecipe", () => {
  it("drops a null timing rather than storing it", () => {
    expect(toSanitizedRecipe(_answer()).timings).toEqual({ preparation: 5, cooking: 15 });
  });

  it("drops a timing the model wrote as a word, and reads one it wrote as prose", () => {
    const timings = { preparation: "null", cooking: "15 minutes", resting: "none" };

    expect(toSanitizedRecipe(_answer({ timings })).timings).toEqual({ cooking: 15 });
  });

  it("drops a timing of 0 — the prompt forbids it, and a model writes it anyway", () => {
    const timings = { preparation: 5, cooking: 0, resting: 0 };

    expect(toSanitizedRecipe(_answer({ timings })).timings).toEqual({ preparation: 5 });
  });

  it("survives a timings object with nothing in it", () => {
    expect(toSanitizedRecipe(_answer({ timings: {} })).timings).toEqual({});
  });

  it("never titles a group with the word for having no title", () => {
    for (const title of [null, "null", "N/A", "none", "  ", "Untitled group".slice(0, 0)])
      expect(toSanitizedRecipe(_answer({ instructions: [{ title, steps: ["Boil"] }] }))
        .instructions[0]).toEqual({ steps: ["Boil"] });
  });

  it("keeps a real group title", () => {
    const instructions = [{ title: "  Sauce  ", steps: ["Boil"] }];

    expect(toSanitizedRecipe(_answer({ instructions })).instructions[0]?.title).toBe("Sauce");
  });

  it("still rejects a wrong answer, as opposed to a badly worded one", () => {
    expect(() => toSanitizedRecipe(_answer({ cuisine: "martian" }))).toThrow();
    expect(() => toSanitizedRecipe(_answer({ ingredients: [{ name: "salt", unit: "g" }] }))).toThrow();
  });
});
