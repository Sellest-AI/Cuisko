import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/ingredients/list."))
      .map(([, load]) => load()),
  ),
);

const seedIngredient = async (t: ReturnType<typeof convexTest>, en: string, fr: string) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { en, fr }, meta: {} },
      emoji: "🥔",
      category: "VEGETABLE",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 77, protein: 2, fat: 0.1, carbohydrates: 17 },
      updatedAt: Date.now(),
    }),
  );

describe("router/ingredients/list", () => {
  test("resolves each name into the caller's locale", async () => {
    const t = convexTest(schema, modules);
    const potatoId = await seedIngredient(t, "Potato", "Pomme de terre");
    const carrotId = await seedIngredient(t, "Carrot", "Carotte");

    const rows = await t.query(api.router.ingredients.list.anon, {
      ids: [potatoId, carrotId],
      locale: "fr",
    });

    expect(rows.map((row) => row.name)).toEqual(["Pomme de terre", "Carotte"]);
  });

  test("skips an id that no longer resolves rather than returning a hole", async () => {
    const t = convexTest(schema, modules);
    const potatoId = await seedIngredient(t, "Potato", "Pomme de terre");
    const goneId = await seedIngredient(t, "Ghost", "Fantôme");
    await t.run((ctx) => ctx.db.delete(goneId));

    const rows = await t.query(api.router.ingredients.list.anon, {
      ids: [goneId, potatoId],
      locale: "en",
    });

    expect(rows.map((row) => row._id)).toEqual([potatoId]);
  });

  test("returns nothing for an empty id list", async () => {
    const t = convexTest(schema, modules);

    expect(await t.query(api.router.ingredients.list.anon, { ids: [], locale: "en" })).toEqual([]);
  });
});
