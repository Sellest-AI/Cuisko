import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { drainScheduled } from "@convex/__tests__/scheduler.fixtures";
import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import { modules } from "@convex/lib/__tests__/modules.fixtures";
import { warmActions } from "@convex/lib/__tests__/warmUp.fixtures";

import schema from "../../../schema";
import { REFRESH_PAGE } from "../refreshRecipesUsing";

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() => warmActions(modules, "/convex/router/recipes/refreshUsing."));

let t: ReturnType<typeof convexTest>;

/** A vegan row: a recipe stored with no tags earns `vegan` once it is refreshed. */
const seedOnion = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "Oignon", en: "Onion" }, meta: {} },
      search: { fr: "oignon", en: "onion" },
      category: "VEGETABLE",
      emoji: "🧅",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 40, protein: 1, fat: 0, carbohydrates: 9 },
      updatedAt: 1,
    }),
  );

const seedRecipeUsing = (ingredientId: Id<"ingredients">, { isArchived = false } = {}) =>
  t.run(async (ctx) => {
    const recipeId = await insertTestRecipe(ctx.db, {
      title: { values: { fr: "Soupe", en: "Soup" }, meta: {} },
      description: { values: { fr: "Une soupe.", en: "A soup." }, meta: {} },
      instructions: { values: { fr: "Cuire.", en: "Cook." }, meta: {} },
      servings: 4,
      difficulty: 2,
      tags: [],
      isArchived,
      updatedAt: 1,
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId, ingredientId, position: 0, quantity: 1, unit: "pcs", updatedAt: 1,
    });

    return recipeId;
  });

const tagsOf = (recipeId: Id<"recipes">) => t.run(async (ctx) => (await ctx.db.get(recipeId))!.tags);

const refreshUsing = (ingredientId: Id<"ingredients">) =>
  t.mutation(internal.router.recipes.refreshUsing._internal, { ingredientId, cursor: null });

const scheduled = () => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

beforeEach(() => {
  t = convexTest(schema, modules);
});

afterEach(() => drainScheduled(t));

describe("refreshRecipesUsing", () => {
  test("every recipe using the row is refreshed", async () => {
    const onion = await seedOnion();
    const soups = [await seedRecipeUsing(onion), await seedRecipeUsing(onion)];

    await refreshUsing(onion);

    for (const soup of soups) expect(await tagsOf(soup)).toContain("vegan");
    expect(await scheduled()).toEqual([]);
  });

  test("an archived recipe is skipped", async () => {
    const onion = await seedOnion();
    const archived = await seedRecipeUsing(onion, { isArchived: true });

    await refreshUsing(onion);

    expect(await tagsOf(archived)).toEqual([]);
  });

  /** One bad line must not leave every other recipe on the row stale. */
  test("a line whose recipe is gone is skipped, and the other recipes are still refreshed", async () => {
    const onion = await seedOnion();
    const gone = await seedRecipeUsing(onion);
    const soup = await seedRecipeUsing(onion);
    await t.run((ctx) => ctx.db.delete(gone));

    await refreshUsing(onion);

    expect(await tagsOf(soup)).toContain("vegan");
  });

  test(`more than ${REFRESH_PAGE} lines are refreshed in pages, each scheduling the next`, async () => {
    const onion = await seedOnion();
    const soups: Id<"recipes">[] = [];
    for (let index = 0; index < REFRESH_PAGE * 2 + 20; index++) soups.push(await seedRecipeUsing(onion));

    await refreshUsing(onion);
    expect(await scheduled()).toHaveLength(1);
    expect(await tagsOf(soups[soups.length - 1]!)).toEqual([]);

    await drainScheduled(t);

    // Three pages: the call above, and the two it and its successor scheduled.
    expect(await scheduled()).toHaveLength(2);
    for (const soup of soups) expect(await tagsOf(soup)).toContain("vegan");
  });
});
