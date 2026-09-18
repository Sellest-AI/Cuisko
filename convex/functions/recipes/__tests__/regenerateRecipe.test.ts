import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import { serializeIngredients } from "@shared/ingredients";
import { serializeInstructions } from "@shared/recipes";

import type { RecipeDetail } from "../loadRecipe";
import type { RecipeEdit } from "../recipeChangesOf";
import { regenerateRecipe } from "../regenerateRecipe";

/**
 * Both collaborators that spend money are mocked, and that is what this file is for.
 *
 * `sanitizeRecipe` is a model call; a resolve reaches two shipped datasets, two live APIs and can
 * call a model once per name. What either ANSWERS belongs to `sanitizeRecipe`'s own test and to
 * `resolveRecipeIngredients.test.ts`. What lives only here is the decision this function exists to
 * make: whether the agent runs at all, and what it hands back for the mutation to persist.
 */
const sanitizeRun = vi.hoisted(() => vi.fn());
const resolveRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/agent/tools/sanitizeRecipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../agent/tools/sanitizeRecipe")>();
  return { ...actual, sanitizeRecipe: { run: sanitizeRun } };
});

vi.mock("@convex/functions/recipes/resolveRecipeIngredients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resolveRecipeIngredients")>();
  return { ...actual, resolveRecipeIngredients: resolveRun };
});

/** Nothing here reaches the database or the scheduler — both collaborators are mocks. */
const ctx = {} as Parameters<typeof regenerateRecipe>[0];

const onionId = "onion" as Id<"ingredients">;

const STORED_INSTRUCTIONS = [{ title: "Base", steps: ["Émincer les oignons."] }];

/**
 * The row being revised, as `getOne._internal` returns it.
 *
 * Note the line is named `Oignons`, the CATALOG row's name, because that is the only name
 * `loadRecipe` has to give: the recipe's own wording is never stored, which is why an edit cannot
 * tell which lines it left alone and re-resolves all of them.
 */
const stored: RecipeDetail & { userId?: Id<"users"> } = {
  id: "recipe" as Id<"recipes">,
  userId: "user" as Id<"users">,
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  cuisine: "french",
  minutes: 15,
  instructions: STORED_INSTRUCTIONS,
  servings: 4,
  difficulty: 2,
  equipments: [],
  tags: ["soup"],
  timings: { preparation: 15 },
  ingredients: [
    {
      name: "Oignons",
      quantity: 2,
      unit: "pcs",
      emoji: "🧅",
      category: "VEGETABLE",
    },
  ],
};

/** Changes nothing: every field round-trips to exactly what `stored` holds. */
const UNCHANGED: RecipeEdit = {
  title: stored.title,
  description: stored.description,
  servings: stored.servings,
  ingredients: serializeIngredients(stored.ingredients),
  instructions: serializeInstructions(STORED_INSTRUCTIONS),
  tags: ["soup"],
  equipments: [],
  difficulty: 2,
  cuisine: "french",
  timings: { preparation: 15 },
};

/** What the mocked agent answers with when it does run. */
const ANALYZED = {
  title: "Soupe à l'oignon, revisitée",
  description: "Une soupe d'hiver, en mieux.",
  servings: 6,
  difficulty: 3 as const,
  cuisine: "french" as const,
  tags: ["soup" as const],
  equipments: [],
  timings: { preparation: 20 },
  instructions: [{ steps: ["Émincer les oignons.", "Ajouter le thym."] }],
  ingredients: [
    { name: "Oignons", quantity: 2, unit: "pcs" as const },
    { name: "thym", quantity: 5, unit: "g" as const },
  ],
};

const regenerate = (edit: Partial<RecipeEdit> = {}) =>
  regenerateRecipe(ctx, { edit: { ...UNCHANGED, ...edit }, stored, locale: "fr" });

/** The arguments the resolver was handed on its first call. */
const resolveArgs = () => resolveRun.mock.calls[0]![1] as Record<string, unknown>;

beforeEach(() => {
  sanitizeRun.mockReset();
  sanitizeRun.mockResolvedValue(ANALYZED);
  resolveRun.mockReset();
  resolveRun.mockResolvedValue({ links: [], complete: true });
});

describe("functions/recipes/regenerateRecipe", () => {
  /**
   * The point of `recipeChangesOf`: difficulty, cuisine, timings and equipment are all derived from
   * the ingredients, so an edit that never touched them has nothing for the agent to re-derive and
   * must not be charged for one.
   */
  test("does not call the agent when only the title changed", async () => {
    const { analyzed, recipe } = await regenerate({ title: "Nouveau titre" });

    expect(sanitizeRun).not.toHaveBeenCalled();
    expect(analyzed).toBe(false);
    // The cook's own words, carried straight through — this is what `analyzed: false` tells
    // `updateRecipe` to store as `"edited"` rather than as `"machine"`.
    expect(recipe.title).toBe("Nouveau titre");
    expect(recipe.difficulty).toBe(stored.difficulty);
  });

  test("calls the agent when the ingredients changed", async () => {
    const { analyzed, recipe } = await regenerate({ ingredients: "2 Oignons\n5 g thym" });

    expect(sanitizeRun).toHaveBeenCalledTimes(1);
    expect(analyzed).toBe(true);
    // The agent's revision wins over the cook's raw text — except `servings` and the five hand-set
    // fields, which the cook stated directly and `reviseRecipe` re-forces after the spread.
    expect(recipe.title).toBe(ANALYZED.title);
    expect(recipe.difficulty).toBe(UNCHANGED.difficulty);
    expect(recipe.servings).toBe(UNCHANGED.servings);
  });

  /** A stale other-locale is the caller's problem to schedule, but this is what tells it. */
  test("reports a translation is needed when a translated field changed, and not otherwise", async () => {
    await expect(regenerate({ title: "Nouveau titre" })).resolves.toMatchObject({
      requiresTranslation: true,
    });

    await expect(regenerate({ servings: 6 })).resolves.toMatchObject({
      requiresTranslation: false,
    });
  });

  /**
   * An earlier design handed the resolver the row's existing links so an untouched line could skip
   * its walk. It could not work: the only name `loadRecipe` returns is the CATALOG row's, and a
   * line reading `oignon` links to a row called `Oignons`, so the two folded keys never met. The
   * walk is re-run instead, which is cheap — the row exists by now, so it is answered by
   * `gatherEvidence`'s catalog step with no dataset, API or model behind it.
   */
  test("asks the resolver to resolve every line, passing it no prior links", async () => {
    await regenerate({ title: "Nouveau titre" });

    expect(resolveArgs()).not.toHaveProperty("known");
  });

  /** The links are the resolver's answer, passed back untouched for the mutation to persist. */
  test("returns the links the resolver answered with", async () => {
    const links = [{ ingredientId: onionId, position: 0, quantity: 2, unit: "pcs" as const }];
    resolveRun.mockResolvedValue({ links, complete: true });

    await expect(regenerate()).resolves.toMatchObject({ links });
  });
});
