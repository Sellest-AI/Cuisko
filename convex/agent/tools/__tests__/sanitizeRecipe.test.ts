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
  instructions: [{ title: null, steps: [{ instruction: "Boil the water", hints: [] }] }],
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

  /** The schema asks for a positive number, not an integer; the app only reads whole minutes. */
  it("rounds a fractional timing rather than storing it", () => {
    const timings = { preparation: 7.5, cooking: 0.3 };

    expect(toSanitizedRecipe(_answer({ timings })).timings).toEqual({ preparation: 8, cooking: 1 });
  });

  it("survives a timings object with nothing in it", () => {
    expect(toSanitizedRecipe(_answer({ timings: {} })).timings).toEqual({});
  });

  it("never titles a group with the word for having no title", () => {
    for (const title of [null, "null", "N/A", "none", "  ", "Untitled group".slice(0, 0)])
      expect(toSanitizedRecipe(_answer({ instructions: [{ title, steps: [{ instruction: "Boil", hints: [] }] }] }))
        .instructions[0]).toEqual({ steps: [{ instruction: "Boil", hints: [] }] });
  });

  it("keeps a real group title", () => {
    const instructions = [{ title: "  Sauce  ", steps: [{ instruction: "Boil", hints: [] }] }];

    expect(toSanitizedRecipe(_answer({ instructions })).instructions[0]?.title).toBe("Sauce");
  });

  /**
   * "No hints" is the answer the model gives on most steps, and it spells it every way it can. Each
   * of these is a valid thing for it to write and must land as [] rather than throw the recipe away.
   */
  it.for([
    { name: "a null list", hints: null },
    { name: "a missing list", hints: undefined },
    { name: "a nothing-word instead of a list", hints: "none" },
    { name: "an empty list", hints: [] },
    { name: "a list of nothing-words", hints: ["", "  ", "null", "N/A", null] },
  ])("reads $name as a step with no hints", ({ hints }) => {
    const instructions = [{ steps: [{ instruction: "Boil", hints }] }];

    expect(toSanitizedRecipe(_answer({ instructions })).instructions[0]?.steps).toEqual([
      { instruction: "Boil", hints: [] },
    ]);
  });

  it("keeps the real hints and drops the empty ones beside them", () => {
    const instructions = [{ steps: [{ instruction: "Boil", hints: ["", "  Salt the water  ", null, "none"] }] }];

    expect(toSanitizedRecipe(_answer({ instructions })).instructions[0]?.steps[0]?.hints).toEqual([
      "Salt the water",
    ]);
  });

  describe("an ingredient's fatUse", () => {
    const fatUseOf = (fatUse: unknown) =>
      toSanitizedRecipe(_answer({ ingredients: [{ name: "vegetable oil", quantity: 7, unit: "tbsp", fatUse }] }))
        .ingredients[0]!;

    it("keeps a preset", () => {
      expect(fatUseOf("fried").fatUse).toBe("fried");
      expect(fatUseOf("deepFried").fatUse).toBe("deepFried");
    });

    it.each([undefined, null, "none"])("reads %s as no fat use", (fatUse) => {
      expect(fatUseOf(fatUse)).not.toHaveProperty("fatUse");
    });

    /**
     * Dropped rather than thrown: an untagged oil counts as all eaten, which is today's figure, and
     * refusing the whole recipe over one tag would cost the cook the import.
     */
    it("drops a value outside the presets, and keeps the line", () => {
      const line = fatUseOf("sauteed");

      expect(line).not.toHaveProperty("fatUse");
      expect(line).toMatchObject({ name: "vegetable oil", quantity: 7, unit: "tbsp" });
    });
  });

  it("still rejects a wrong answer, as opposed to a badly worded one", () => {
    expect(() => toSanitizedRecipe(_answer({ cuisine: "martian" }))).toThrow();
    expect(() => toSanitizedRecipe(_answer({ ingredients: [{ name: "salt", unit: "g" }] }))).toThrow();
  });
});
