import { convexTest } from "convex-test";
import { beforeAll, beforeEach, expect, test } from "vitest";

import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import { modules } from "@convex/lib/__tests__/modules.fixtures";
import { warmActions } from "@convex/lib/__tests__/warmUp.fixtures";

import schema from "../../../schema";

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() => warmActions(modules, "/convex/router/ingredients/getUses."));

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const insertHam = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "jambon", en: "ham" }, meta: {} },
      search: { fr: "jambon", en: "ham" },
      category: "MEAT",
      emoji: "🍖",
      allergens: [],
      defaultUnit: "g",
      defaultQuantity: 100,
      nutrition: { calories: 145, protein: 21, fat: 6, carbohydrates: 1 },
      updatedAt: 1,
    }),
  );

const insertRecipe = (values: { fr: string; en?: string }, isArchived = false) =>
  t.run((ctx) => insertTestRecipe(ctx.db, { title: { values, meta: {} }, isArchived }));

const insertLine = (recipeId: Id<"recipes">, ingredientId: Id<"ingredients">, quantity: number, unit: "slice" | "g") =>
  t.run((ctx) => ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position: 0, quantity, unit, updatedAt: 1 }));

/** A deleted recipe's line is not a use (ADR 0017): it is dropped by hand, since it is reached by id. */
test("lists every live recipe's line with its title, and drops an archived recipe's", async () => {
  const ham = await insertHam();
  await insertLine(await insertRecipe({ fr: "Croque-monsieur", en: "Croque-monsieur" }), ham, 2, "slice");
  await insertLine(await insertRecipe({ fr: "Salade effacée", en: "Deleted salad" }, true), ham, 100, "g");

  expect(await t.query(internal.router.ingredients.getUses._internal, { ingredientId: ham })).toEqual([
    { quantity: 2, unit: "slice", recipeTitle: "Croque-monsieur" },
  ]);
});

/**
 * The repair prompt is in English, so the English title wins, and a recipe with none shows its
 * French one. Newest line first: the save that asked for the repair linked it last.
 */
test("takes the English title, else the French one, newest line first", async () => {
  const ham = await insertHam();
  await insertLine(await insertRecipe({ fr: "Quiche lorraine", en: "Quiche Lorraine" }), ham, 150, "g");
  await insertLine(await insertRecipe({ fr: "Jambon-beurre" }), ham, 2, "slice");

  expect(await t.query(internal.router.ingredients.getUses._internal, { ingredientId: ham })).toEqual([
    { quantity: 2, unit: "slice", recipeTitle: "Jambon-beurre" },
    { quantity: 150, unit: "g", recipeTitle: "Quiche Lorraine" },
  ]);
});
