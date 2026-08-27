import { describe, expect, test } from "vitest";

import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { ModelRecipe } from "@convex/functions/recipes/toModelRecipe";
import { serializeIngredients } from "@shared/ingredients";
import { serializeInstructions } from "@shared/recipes";

import { recipeChangesOf, type RecipeEdit, reviseRecipe } from "../recipeChangesOf";

/**
 * The row an edit revises. Deliberately concrete rather than a builder with every field optional:
 * the assertions below are all about which of TWO sources wins for a given field, so a fixture
 * whose values are indistinguishable from the edit's would pass whatever the merge did.
 */
const OUTDATED: ModelRecipe = {
  title: "Onion soup",
  description: "A winter soup.",
  servings: 4,
  difficulty: 2,
  cuisine: "french",
  tags: ["soup"],
  equipments: ["oven"],
  timings: { preparation: 15, cooking: 30 },
  instructions: [{ title: "Base", steps: ["Slice the onions.", "Sweat them."] }],
  ingredients: [{ name: "Onion", quantity: 4, unit: "pcs" }],
};

/** An edit that changes nothing, built from the row so the "unchanged" comparisons are honest. */
const unchangedEdit = (): RecipeEdit => ({
  title: OUTDATED.title,
  description: OUTDATED.description,
  servings: OUTDATED.servings,
  ingredients: serializeIngredients(OUTDATED.ingredients),
  instructions: serializeInstructions(
    OUTDATED.instructions.map((group) => ({ ...group, title: group.title ?? undefined })),
  ),
});

/** What the agent hands back when it does run — every value distinct from both the row and the edit. */
const ANALYZED: SanitizedRecipe = {
  title: "Agent's onion soup",
  description: "The agent's description.",
  servings: 99,
  difficulty: 3,
  cuisine: "italian",
  tags: ["salad"],
  equipments: ["grill"],
  timings: { preparation: 5, cooking: 10, resting: undefined },
  instructions: [{ title: "Agent base", steps: ["Do it the agent's way."] }],
  ingredients: [{ name: "Shallot", quantity: 2, unit: "pcs" }],
};

describe("recipeChangesOf", () => {
  test("asks for nothing when the edit changed nothing", () => {
    expect(recipeChangesOf(unchangedEdit(), OUTDATED)).toEqual({
      requiresNewAnalysis: false,
      requiresTranslation: false,
    });
  });

  /**
   * The saving the whole edit path exists for: the derived fields all fall out of the ingredients,
   * so a title-only edit has nothing for the agent to re-derive and must not spend a model call.
   */
  test("does not re-analyze a title-only edit, but does retranslate it", () => {
    expect(recipeChangesOf({ ...unchangedEdit(), title: "Soupe" }, OUTDATED)).toEqual({
      requiresNewAnalysis: false,
      requiresTranslation: true,
    });
  });

  /** The converse: ingredients are what the agent reads, and nothing translated moved. */
  test("re-analyzes an ingredient edit without calling it a translation change", () => {
    expect(recipeChangesOf({ ...unchangedEdit(), ingredients: "5 pcs Onion" }, OUTDATED)).toEqual({
      requiresNewAnalysis: true,
      requiresTranslation: false,
    });
  });
});

describe("reviseRecipe", () => {
  /**
   * The cook typed a number. Nothing the agent re-derives from the ingredients makes its opinion
   * about how many people that feeds more correct than the answer they actually gave — and
   * `createOne` re-forces `servings` after sanitizing for the same reason, so a disagreement here
   * would mean the two write paths owned this field differently.
   */
  test("keeps the cook's servings even when the agent returned its own", () => {
    const revised = reviseRecipe({ ...unchangedEdit(), servings: 6 }, OUTDATED, ANALYZED);

    expect(revised.servings).toBe(6);
  });

  test("keeps the cook's servings when no agent ran", () => {
    const revised = reviseRecipe({ ...unchangedEdit(), servings: 6 }, OUTDATED, undefined);

    expect(revised.servings).toBe(6);
  });

  /** `servings` is the exception, not the rule — everything else the agent re-derived must win. */
  test("lets the agent win on every field it actually re-derived", () => {
    const revised = reviseRecipe(unchangedEdit(), OUTDATED, ANALYZED);

    expect(revised.difficulty).toBe(ANALYZED.difficulty);
    expect(revised.cuisine).toBe(ANALYZED.cuisine);
    expect(revised.equipments).toEqual(ANALYZED.equipments);
    expect(revised.timings).toEqual(ANALYZED.timings);
    expect(revised.ingredients).toEqual(ANALYZED.ingredients);
  });

  /** With no agent run, the cook's own prose is the answer, layered over the row underneath. */
  test("carries the cook's text through untouched when no agent ran", () => {
    const revised = reviseRecipe({ ...unchangedEdit(), title: "Soupe" }, OUTDATED, undefined);

    expect(revised.title).toBe("Soupe");
    expect(revised.description).toBe(OUTDATED.description);
    expect(revised.cuisine).toBe(OUTDATED.cuisine);
  });

  /** `userId` rides on `ModelRecipe` for the ownership check; `vSanitizedRecipe` would reject it. */
  test("does not carry userId into the persisted payload", () => {
    const revised = reviseRecipe(unchangedEdit(), { ...OUTDATED, userId: undefined }, undefined);

    expect(revised).not.toHaveProperty("userId");
  });
});
