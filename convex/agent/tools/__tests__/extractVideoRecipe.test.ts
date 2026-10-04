import { describe, expect, it, vi } from "vitest";

import { codeOf } from "../../../lib/__tests__/convexError.fixtures";
import { toVideoRecipe, videoRecipeOutputSchema } from "../extractVideoRecipe";

/** The download half leaves the process (`node:https`); only the verdict on the answer is tested here. */
vi.mock("@convex/lib/socialVideo/httpsGet", () => ({ httpsDownloadVideo: vi.fn() }));

/**
 * The boundary right after the model call, as in `sanitizeRecipe.test.ts`: the schema forces every
 * recipe field to be filled, so a video that teaches no dish still comes back as a recipe-shaped
 * answer. `teachesRecipe` is the only thing that tells the two apart, and it is what must stop the
 * import before a made-up recipe is saved and served to every cook who shares that video.
 */
const _answer = (overrides: Record<string, unknown> = {}) => ({
  teachesRecipe: true,
  title: "Shakshuka",
  description: "Eggs poached in a spiced tomato and pepper sauce.",
  servings: 2,
  difficulty: 1,
  cuisine: "levantine",
  tags: [],
  equipments: [],
  timings: { preparation: 10, cooking: 20, resting: null },
  instructions: [{ title: null, steps: [{ instruction: "Soften the peppers", hints: [] }] }],
  ingredients: [{ name: "egg", quantity: 4, unit: "pcs" }],
  ...overrides,
});

describe("toVideoRecipe", () => {
  it("reads a video that teaches a dish as the recipe", () => {
    expect(toVideoRecipe(_answer())).toMatchObject({ title: "Shakshuka", timings: { preparation: 10, cooking: 20 } });
  });

  it("is NOT_A_RECIPE when the model says the video teaches no dish, whatever it filled in", () => {
    expect(codeOf(() => toVideoRecipe(_answer({ teachesRecipe: false })))).toBe("NOT_A_RECIPE");
  });

  it("is NOT_A_RECIPE when the verdict is missing, rather than saving a recipe nobody vouched for", () => {
    const { teachesRecipe: _dropped, ...answer } = _answer();

    expect(codeOf(() => toVideoRecipe(answer))).toBe("NOT_A_RECIPE");
  });

  /**
   * MiMo's real answer to a reel with no recipe (Instagram `Dd9oOCIJqso`, 2026-10-05): the verdict
   * is right, and the fields it was told to fill "minimally" break the recipe schema (timings of 0).
   * Validated by the AI SDK, that answer threw `AI_NoObjectGeneratedError` before the verdict was
   * read, and the cook was told the service was down.
   */
  const MIMO_NOT_A_RECIPE = {
    teachesRecipe: false,
    title: "",
    description: "",
    servings: 0,
    difficulty: 1,
    cuisine: "other",
    tags: [],
    equipments: [],
    timings: { preparation: 0, cooking: 0, resting: 0 },
    instructions: [],
    ingredients: [],
  };

  it("is NOT_A_RECIPE for that answer, though its fields break the recipe schema", () => {
    expect(codeOf(() => toVideoRecipe(MIMO_NOT_A_RECIPE))).toBe("NOT_A_RECIPE");
  });

  it("is handed to the AI SDK unvalidated, so that answer reaches the verdict at all", async () => {
    expect(videoRecipeOutputSchema.validate).toBeUndefined();
    expect(await videoRecipeOutputSchema.jsonSchema).toMatchObject({
      properties: { teachesRecipe: { type: "boolean" }, timings: expect.any(Object) },
    });
  });
});
