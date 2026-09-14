import migrationsTest from "@convex-dev/migrations/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { internal } from "@convex/_generated/api";
import schema from "../schema";
import { cascadeDelete } from "../functions/cascade";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

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