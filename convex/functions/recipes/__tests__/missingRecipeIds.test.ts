import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import schema from "../../../schema";
import { missingRecipeIds } from "../missingRecipeIds";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedRecipe = () =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { en: "Onion soup" }, meta: {} },
      description: { values: { en: "A winter soup." }, meta: {} },
      instructions: { values: { en: "Base\n- Slice the onions." }, meta: {} },
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
      updatedAt: Date.now(),
    }),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
});

/**
 * Every way a model can hand the display tool a wrong id, each answered the same way: listed back.
 * The display tool throws on anything listed, so an id missing from this answer is a card drawn.
 */
describe("missingRecipeIds", () => {
  test("a live recipe is not missing", async () => {
    const id = await seedRecipe();

    expect(await t.run((ctx) => missingRecipeIds(ctx, { ids: [id] }))).toEqual([]);
  });

  test("a deleted recipe is", async () => {
    const id = await seedRecipe();
    await t.run((ctx) => ctx.db.delete(id));

    expect(await t.run((ctx) => missingRecipeIds(ctx, { ids: [id] }))).toEqual([id]);
  });

  /** The two a model actually produces: a mangled copy, and an id it lifted from another tool. */
  test("a malformed string and another table's id are, without failing the whole call", async () => {
    const recipeId = await seedRecipe();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));

    expect(
      await t.run((ctx) => missingRecipeIds(ctx, { ids: ["not-an-id", recipeId, userId] })),
    ).toEqual(["not-an-id", userId]);
  });
});
