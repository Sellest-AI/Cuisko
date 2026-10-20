import { NoOutputGeneratedError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchTerms } from "@shared/ingredientMatch";

import { verifierAgent } from "../../agents";
import { type TracedToolCtx, wrapAgent } from "../../utils";
import { modelRecipeSchema } from "../sanitizeRecipe";
import { pageIngredientQueries, toRecipeVerification, verifyRecipe, verifyRecipeUserPrompt } from "../verifyRecipe";

/** The model call and the catalog index leave the process; what is tested is what the tool does with their answers. */
vi.mock("../../utils", async (importOriginal) => ({ ...(await importOriginal<object>()), wrapAgent: vi.fn() }));
vi.mock("../searchIngredients", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchIngredients: vi.fn(async () => []),
}));

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

describe("pageIngredientQueries", () => {
  it("asks the catalog for each line's identifying words, not the line as written", () => {
    expect(pageIngredientQueries("600 g de blancs de poulet, en lanières\n2 c. à soupe d'huile de tournesol")).toEqual([
      { line: "600 g de blancs de poulet, en lanières", query: searchTerms("600 g de blancs de poulet, en lanières") },
      { line: "2 c. à soupe d'huile de tournesol", query: searchTerms("2 c. à soupe d'huile de tournesol") },
    ]);
    expect(searchTerms("600 g de blancs de poulet, en lanières")).not.toMatch(/600|lanières/);
  });

  it("leaves out a blank line", () => {
    expect(pageIngredientQueries("\n  \n1 poivron rouge\n").map(({ line }) => line)).toEqual(["1 poivron rouge"]);
  });
});

describe("verifyRecipeUserPrompt", () => {
  const source = { title: "Poulet frit", description: "", servings: 4, ingredients: "600 g de blancs de poulet", instructions: "Faites frire le poulet" };

  it("shows the rows each page line found, with their aliases, and says when a line found none", () => {
    const prompt = verifyRecipeUserPrompt({
      stored: modelRecipeSchema.parse(_recipe()),
      source,
      catalog: [
        { line: "600 g de blancs de poulet", rows: [{ name: "Blanc de poulet", aliases: ["filet de poulet"] }, { name: "Poulet entier" }] },
        { line: "1 pincée de sumac", rows: [] },
      ],
    });

    expect(prompt).toContain(`- "600 g de blancs de poulet": Blanc de poulet (also: filet de poulet); Poulet entier`);
    expect(prompt).toContain(`- "1 pincée de sumac": nothing found`);
  });

  it("has no catalog section when the page had no line to search", () => {
    expect(verifyRecipeUserPrompt({ stored: modelRecipeSchema.parse(_recipe()), source, catalog: [] })).not.toContain("The catalog");
  });
});

describe("verifyRecipe", () => {
  const PAGE = { title: "Poulet frit", description: "", servings: 4, ingredients: "600 g de blancs de poulet", instructions: "Faites frire le poulet" };
  const _ctx = () => ({ runTracedAction: vi.fn(async () => PAGE) }) as unknown as TracedToolCtx;
  const _input = () => ({ locale: "fr" as const, stored: modelRecipeSchema.parse(_recipe()), url: "https://example.com/poulet" });

  /** The model's replies in order, each one a `generateText` result. */
  const _replies = (...outputs: (() => unknown)[]) => {
    const generateText = vi.fn();
    for (const output of outputs) generateText.mockResolvedValueOnce({ get output() { return output(); } });
    vi.mocked(wrapAgent).mockReturnValue({ generateText } as unknown as ReturnType<typeof wrapAgent>);
    return generateText;
  };

  const NOTHING_TO_FIX = () => ({ corrections: [], recipe: null });

  // `retryPromise` warns on each failed attempt; silenced here, and restored for the rest of the file.
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  /**
   * A reply cut at `maxOutputTokens` does not reject: `generateText` resolves, and only its `output`
   * getter throws. Read outside the retry, that ended a catalog run's verify of a yassa on its first
   * attempt (2026-10-20).
   */
  it("asks again when the reply was cut off before it could be read", async () => {
    const generateText = _replies(() => { throw new NoOutputGeneratedError(); }, NOTHING_TO_FIX);

    await expect(verifyRecipe.run!(_ctx(), _input())).resolves.toEqual({ corrections: [], recipe: null });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("asks again when the reply lists corrections but no recipe", async () => {
    const generateText = _replies(() => ({ corrections: ["L'huile manquait."], recipe: null }), NOTHING_TO_FIX);

    await expect(verifyRecipe.run!(_ctx(), _input())).resolves.toEqual({ corrections: [], recipe: null });
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});

describe("verifierAgent", () => {
  // The longest verify that finished on its own wrote 2,258 tokens (PostHog, 2026-10-13 to 10-20);
  // 4 of 44 never finished and ran to the provider's 65,536, at $0.66 each.
  it("caps a generation's output well above the longest answer and far below a runaway", () => {
    const cap = verifierAgent.options.callSettings?.maxOutputTokens;

    expect(cap).toBeGreaterThanOrEqual(2 * 2_258);
    expect(cap).toBeLessThanOrEqual(8_000);
  });
});
