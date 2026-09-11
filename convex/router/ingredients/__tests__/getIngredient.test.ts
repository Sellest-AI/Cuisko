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
      .filter(([path]) => path.startsWith("/convex/router/ingredients/getIngredient."))
      .map(([, load]) => load()),
  ),
);

const seedIngredient = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug: "potato",
      name: { values: { en: "Potato", fr: "Pomme de terre" }, meta: {} },
      emoji: "🥔",
      aliases: { fr: ["patates"] },
      search: { en: "Potato", fr: "Pomme de terre patates" },
      category: "VEGETABLE",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 77, protein: 2, fat: 0.1, carbohydrates: 17 },
      updatedAt: Date.now(),
    }),
  );

describe("router/ingredients/getIngredient", () => {
  test("resolves the name into the caller's locale", async () => {
    const t = convexTest(schema, modules);
    const id = await seedIngredient(t);

    const ingredient = await t.query(api.router.ingredients.getIngredient.anon, { id, locale: "fr" });

    expect(ingredient.name).toBe("Pomme de terre");
  });

  test("hands out the same shape as search and list — no server-only fields", async () => {
    const t = convexTest(schema, modules);
    const id = await seedIngredient(t);

    const ingredient = await t.query(api.router.ingredients.getIngredient.anon, { id, locale: "en" });

    expect(ingredient).not.toHaveProperty("search");
    expect(ingredient.aliases).toBeUndefined(); // seeded only in `fr`
    expect(ingredient.emoji).toBe("🥔");
  });
});
