import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../../../_generated/api";
import schema from "../../../schema";
import { CATALOG } from "../../../functions/ingredients/ingredientCatalog";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

describe("router/ingredients/seedCatalog", () => {
  test("writes the whole catalog", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.router.ingredients.seedCatalog._internal, {});

    expect(result).toEqual({ created: CATALOG.length, updated: 0, total: CATALOG.length });

    const rows = await t.run((ctx) => ctx.db.query("ingredients").collect());
    expect(rows).toHaveLength(CATALOG.length);
  });

  test("re-running updates in place rather than duplicating", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.router.ingredients.seedCatalog._internal, {});
    const second = await t.mutation(internal.router.ingredients.seedCatalog._internal, {});

    expect(second).toEqual({ created: 0, updated: CATALOG.length, total: CATALOG.length });

    const rows = await t.run((ctx) => ctx.db.query("ingredients").collect());
    expect(rows).toHaveLength(CATALOG.length);
  });

  test("carries both locales and a nutri-score on every row", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.router.ingredients.seedCatalog._internal, {});

    const rows = await t.run((ctx) => ctx.db.query("ingredients").collect());

    for (const row of rows) {
      expect(row.name.values.en).toBeTruthy();
      expect(row.name.values.fr).toBeTruthy();
      expect(row.nutriScore?.grade).toMatch(/^[A-E]$/);
    }
  });

  test("gives every catalog entry a distinct slug — a duplicate would silently overwrite", () => {
    expect(new Set(CATALOG.map((entry) => entry.slug)).size).toBe(CATALOG.length);
  });
});
