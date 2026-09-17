import migrationsTest from "@convex-dev/migrations/test";
import { convexTest } from "convex-test";
import { defineSchema } from "convex/server";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "@convex/_generated/api";
import schema from "../schema";
import { cascadeDelete } from "../functions/cascade";
import { cellarItems, groceryListItems, recentlyUsedIngredients } from "../schema/cellars";
import { ingredients } from "../schema/ingredients";
import { plannedMealIngredients } from "../schema/planning";
import { recipeIngredients } from "../schema/recipes";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts.
 * Cold, the first test here paid 2.2s for `migrations.ts` and the component graph beneath it, and
 * timed out under `pnpm verify` load; warmed, it pays the same as its neighbours.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/migrations."))
      .map(([, load]) => load()),
  ),
);

let t: ReturnType<typeof convexTest>;

const insertRecipe = (fields: { shuffleKey?: number } = {}) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: "Base\n- Émincer les oignons." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { en: "", fr: "" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      ...fields,
      updatedAt: Date.now(),
    }),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
  // convex-test only knows the components it is told about; the runner delegates to this one.
  migrationsTest.register(t);
});

describe("backfillRecipeShuffleKey", () => {
  /**
   * The migration is the only writer of `shuffleKey` for rows that predate the field. A recipe
   * inserted without one must come back with a number, and a recipe that already carries one must
   * be left alone — the migration is idempotent, and the guard is what makes it so.
   */
  test("writes a shuffle key onto recipes that lack one and skips recipes that have one", async () => {
    const withoutKey = await insertRecipe();
    const withKey = await insertRecipe({ shuffleKey: 42 });

    await t.mutation(internal.migrations.runBackfillRecipeShuffleKey, {});

    const missing = await t.run((ctx) => ctx.db.get(withoutKey));
    const present = await t.run((ctx) => ctx.db.get(withKey));

    expect(missing?.shuffleKey).toBeTypeOf("number");
    expect(present?.shuffleKey).toBe(42);
  });

  /**
   * The whole point of the optional-field phase: a row that the migration has not yet reached is
   * still a valid recipe. This asserts the schema shape rather than the migration's reach, but it
   * is the invariant that lets the migration be deployed separately from the field becoming
   * required — and it is what the required-field transition below invalidates.
   */
  test("leaves a recipe without a shuffle key readable until the field becomes required", async () => {
    const recipeId = await insertRecipe();

    // No migration run, no key written — the row is valid because the field is optional.
    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row).not.toBeNull();
    expect(row?.shuffleKey).toBeUndefined();

    await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));
  });
});
/**
 * The six tables the spoon rename touches, with schema validation off.
 *
 * Off because the state the migration exists for cannot otherwise be built: `vUnit` no longer
 * holds the `cs` literal, so `convexTest(schema, …)` rejects the very row under test at insert.
 * The table DEFINITIONS are the real ones — only the gate is relaxed — so a row here is shaped
 * exactly like the rows on a deployment that has not been migrated yet, which is the point.
 */
const legacySchema = defineSchema(
  {
    ingredients,
    groceryListItems,
    cellarItems,
    recentlyUsedIngredients,
    plannedMealIngredients,
    recipeIngredients,
  },
  { schemaValidation: false },
);

describe("renameSpoonUnits", () => {
  let legacy: ReturnType<typeof convexTest>;

  beforeEach(() => {
    legacy = convexTest(legacySchema, modules);
    migrationsTest.register(legacy);
  });

  /**
   * The runner starts the FIRST migration and schedules the next, each one chaining the one after
   * it. Nothing in `convex-test` runs a scheduled function by itself, so a bare `t.mutation` here
   * migrates table one and silently leaves the other five — which is exactly how this test first
   * passed on `recipeIngredients` while `plannedMealIngredients` kept its spoons.
   */
  const runAll = async () => {
    vi.useFakeTimers();
    try {
      await legacy.mutation(internal.migrations.runRenameSpoonUnits, {});
      await legacy.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
  };

  /** The stored codes went English so that no model could read `cc` as a cubic centimetre. */
  test("rewrites cs to tbsp and cc to tsp, and leaves a row already on the new code alone", async () => {
    const spoon = await legacy.run((ctx) =>
      ctx.db.insert("recipeIngredients", {
        recipeId: "r" as never,
        ingredientId: "i" as never,
        position: 0,
        quantity: 2,
        unit: "cs" as never,
        updatedAt: Date.now(),
      }),
    );
    const already = await legacy.run((ctx) =>
      ctx.db.insert("recipeIngredients", {
        recipeId: "r" as never,
        ingredientId: "i" as never,
        position: 1,
        quantity: 1,
        unit: "tbsp",
        updatedAt: 1,
      }),
    );
    const untouched = await legacy.run((ctx) =>
      ctx.db.insert("cellarItems", {
        householdId: "h" as never,
        ingredientId: "i" as never,
        unit: "g",
        amount: 500,
        updatedAt: 1,
      }),
    );

    await runAll();

    expect((await legacy.run((ctx) => ctx.db.get(spoon)))?.unit).toBe("tbsp");
    expect((await legacy.run((ctx) => ctx.db.get(untouched)))?.unit).toBe("g");

    /**
     * Idempotency, asserted on `updatedAt` rather than on the unit: the code would read `tbsp`
     * either way, so only the untouched timestamp distinguishes "skipped" from "rewritten to the
     * value it already had". The migration is run more than once by construction.
     */
    expect(await legacy.run((ctx) => ctx.db.get(already))).toMatchObject({ unit: "tbsp", updatedAt: 1 });
  });

  /**
   * The only table carrying two unit fields, and the reason this migration is six `define()` calls
   * rather than a loop: a rename that moved `unit` and forgot `sourceUnit` would leave the recipe's
   * own words spelled in a literal the schema no longer accepts, and the next write to that row
   * would fail rather than the migration.
   */
  test("moves both unit fields on plannedMealIngredients", async () => {
    const line = await legacy.run((ctx) =>
      ctx.db.insert("plannedMealIngredients", {
        plannedMealId: "m" as never,
        ingredientId: "i" as never,
        sourceQuantity: 1,
        sourceUnit: "cc" as never,
        quantity: 5,
        unit: "cs" as never,
        updatedAt: Date.now(),
      }),
    );

    await runAll();

    expect(await legacy.run((ctx) => ctx.db.get(line))).toMatchObject({ sourceUnit: "tsp", unit: "tbsp" });
  });
});
