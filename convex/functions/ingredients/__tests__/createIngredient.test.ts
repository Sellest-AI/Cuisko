import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import schema from "../../../schema";
import { createIngredient } from "../createIngredient";
import type { IngredientFacts } from "../ingredientRow";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

/** A complete fact set, as `sanitizeIngredient` hands one over: both languages, all eight nutrients. */
const RUTABAGA: IngredientFacts = {
  names: {
    fr: { value: "Rutabaga", status: "edited" },
    en: { value: "Swede", status: "machine" },
  },
  emoji: "🥔",
  aliases: { fr: ["chou-navet"], en: ["rutabaga"] },
  category: "VEGETABLE",
  diet: "vegan",
  allergens: [],
  defaultUnit: "g",
  defaultQuantity: 200,
  nutrition: {
    calories: 36,
    protein: 1.1,
    fat: 0.2,
    saturatedFat: 0,
    carbohydrates: 8.1,
    sugars: 4.5,
    fiber: 2.3,
    sodium: 12,
  },
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/ingredients/createIngredient", () => {
  /**
   * The ADR 0011 guard on this writer: it hands facts over and shapes nothing itself, so the three
   * derived fields have to arrive without the caller having mentioned them. `search` is the one
   * that fails silently when a writer forgets — the row exists and is simply never found again.
   */
  test("derives search, nutriScore and the localized name from the facts alone", async () => {
    const ingredientId = await t.run((ctx) => createIngredient(ctx, RUTABAGA, "foodComposition"));
    const row = await t.run((ctx) => ctx.db.get(ingredientId));

    expect(row?.name.values).toEqual({ fr: "Rutabaga", en: "Swede" });
    // Name and aliases flattened per locale, through the shared sanitizer — which is why the
    // blob reads "chou navet" and not "chou-navet". That folding is the whole point: a shopper
    // typing either spelling reaches the row, and only @shared/search decides which form is
    // stored (ADR 0011).
    expect(row?.search?.fr).toBe("rutabaga chou navet");
    expect(row?.search?.en).toBe("swede rutabaga");
    expect(row?.nutriScore?.grade).toBeDefined();
    expect(row?.updatedAt).toBeTypeOf("number");
  });

  /**
   * `source` is the caller's, not this function's. A row whose numbers came from CIQUAL and whose
   * category came from the agent records the composition table — see `provenanceOf` — and a screen
   * caveating a Nutri-Score reads exactly this field to decide how loudly.
   */
  test("records the provenance the caller supplies rather than assuming the agent", async () => {
    const measured = await t.run((ctx) => createIngredient(ctx, RUTABAGA, "foodComposition"));
    const invented = await t.run((ctx) => createIngredient(ctx, RUTABAGA, "agent"));

    expect(await t.run((ctx) => ctx.db.get(measured)))
      .toMatchObject({ source: "foodComposition" });
    expect(await t.run((ctx) => ctx.db.get(invented))).toMatchObject({ source: "agent" });
  });

  /**
   * A row grown from a shopper's typing has no `slug`: it is the seed's dedup key and there is
   * nothing stable to key this by. What stops the duplicate is upstream, in `resolveIngredient`.
   */
  test("leaves slug unset, so nothing mistakes an invented row for a seeded one", async () => {
    const ingredientId = await t.run((ctx) => createIngredient(ctx, RUTABAGA, "agent"));

    // Absent, not `undefined`: Convex drops the key, so `by_slug` never sees this row at all.
    expect(await t.run((ctx) => ctx.db.get(ingredientId))).not.toHaveProperty("slug");
  });
});
