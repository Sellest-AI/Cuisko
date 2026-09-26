import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import schema from "../../../schema";
import { missingIngredientIds } from "../missingIngredientIds";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedIngredient = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug: "milk",
      name: { values: { en: "Milk", fr: "Lait" }, meta: {} },
      emoji: "🥛",
      search: { en: "Milk", fr: "Lait" },
      category: "DAIRY",
      defaultUnit: "ml",
      defaultQuantity: 1000,
      nutrition: { calories: 64, protein: 3.3, fat: 3.6, carbohydrates: 4.8 },
      updatedAt: Date.now(),
    }),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
});

/**
 * Every way a model can hand the display tool a wrong ingredient id, each answered the same way:
 * listed back. The display tool throws on anything listed.
 */
describe("missingIngredientIds", () => {
  test("a catalog ingredient is not missing", async () => {
    const id = await seedIngredient();

    expect(await t.run((ctx) => missingIngredientIds(ctx, { ids: [id] }))).toEqual([]);
  });

  test("a deleted ingredient is", async () => {
    const id = await seedIngredient();
    await t.run((ctx) => ctx.db.delete(id));

    expect(await t.run((ctx) => missingIngredientIds(ctx, { ids: [id] }))).toEqual([id]);
  });

  /** A mangled copy, and a recipe id handed to the wrong kind of card. */
  test("a malformed string and another table's id are, without failing the whole call", async () => {
    const ingredientId = await seedIngredient();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));

    expect(
      await t.run((ctx) => missingIngredientIds(ctx, { ids: ["not-an-id", ingredientId, userId] })),
    ).toEqual(["not-an-id", userId]);
  });
});
