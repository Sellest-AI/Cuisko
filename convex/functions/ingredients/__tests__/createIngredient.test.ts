import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import schema from "../../../schema";
import { createIngredient } from "../createIngredient";
import type { IngredientFacts } from "../ingredientRow";
import type { IngredientSource } from "@shared/ingredients";

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

/** A second, unrelated food, for the tests that need two rows to exist side by side. */
const PARSNIP: IngredientFacts = {
  ...RUTABAGA,
  names: {
    fr: { value: "Panais", status: "edited" },
    en: { value: "Parsnip", status: "machine" },
  },
  aliases: {},
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

/** The id of a row the test expects to be freshly inserted — fails loudly if it was reused. */
const created = async (facts: IngredientFacts, source: IngredientSource) => {
  const result = await t.run((ctx) => createIngredient(ctx, facts, source));
  if (!result.created) throw new Error(`expected ${facts.names.fr.value} to be inserted`);

  return result.ingredientId;
};

describe("functions/ingredients/createIngredient", () => {
  /**
   * The ADR 0011 guard on this writer: it hands facts over and shapes nothing itself, so the three
   * derived fields have to arrive without the caller having mentioned them. `search` is the one
   * that fails silently when a writer forgets — the row exists and is simply never found again.
   */
  test("derives search, nutriScore and the localized name from the facts alone", async () => {
    const ingredientId = await created(RUTABAGA, "foodComposition");
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
    const measured = await created(RUTABAGA, "foodComposition");
    const invented = await created(PARSNIP, "agent");

    expect(await t.run((ctx) => ctx.db.get(measured)))
      .toMatchObject({ source: "foodComposition" });
    expect(await t.run((ctx) => ctx.db.get(invented))).toMatchObject({ source: "agent" });
  });

  /**
   * A row grown from a shopper's typing has no `slug`: it is the seed's dedup key and there is
   * nothing stable to key this by. The name is what the re-check below reads instead.
   */
  test("leaves slug unset, so nothing mistakes an invented row for a seeded one", async () => {
    const ingredientId = await created(RUTABAGA, "agent");

    // Absent, not `undefined`: Convex drops the key, so `by_slug` never sees this row at all.
    expect(await t.run((ctx) => ctx.db.get(ingredientId))).not.toHaveProperty("slug");
  });

  /**
   * The recipe-import race: two walks for `coriandre` both searched an empty catalog, both asked
   * the model, and the dev catalog grew two identical rows eight seconds apart. The second create
   * must find the first rather than insert beside it.
   */
  test("reuses a row of the same name instead of inserting a second one", async () => {
    const first = await created(RUTABAGA, "foodComposition");
    const second = await t.run((ctx) =>
      createIngredient(ctx, { ...RUTABAGA, sourceLocale: "fr" }, "agent"),
    );

    expect(second).toMatchObject({ created: false, existing: { ingredientId: first, name: "Rutabaga" } });
    expect(await t.run((ctx) => ctx.db.query("ingredients").take(5))).toHaveLength(1);
  });

  /**
   * The seeded `cilantro` row ("Coriandre fraîche") lists `coriandre` as an alias; a new row named
   * `coriandre` is that food. Both names differ here, so only the alias can make the match.
   */
  test("reuses a row whose alias is the new row's name", async () => {
    const first = await created(RUTABAGA, "foodComposition");
    const second = await t.run((ctx) =>
      createIngredient(ctx, {
        ...PARSNIP,
        names: {
          fr: { value: "Chou-navet", status: "edited" },
          en: { value: "Yellow turnip", status: "machine" },
        },
        sourceLocale: "fr",
      }, "agent"),
    );

    expect(second).toMatchObject({ created: false, existing: { ingredientId: first } });
  });

  /**
   * Only the shopper's own word is compared. English folds what French keeps apart: `Potiron`
   * renders as "Pumpkin", and so does `Citrouille`, another squash with another flesh. Matching on
   * the rendering would link the recipe line to the wrong vegetable with nobody asked.
   */
  test("does not reuse a row that only shares a translated name", async () => {
    await created(
      { ...PARSNIP, names: { fr: { value: "Citrouille", status: "edited" }, en: { value: "Pumpkin", status: "edited" } } },
      "seed",
    );
    const second = await t.run((ctx) =>
      createIngredient(ctx, {
        ...PARSNIP,
        names: {
          fr: { value: "Potiron", status: "edited" },
          en: { value: "Pumpkin", status: "machine" },
        },
        sourceLocale: "fr",
      }, "agent"),
    );

    expect(second.created).toBe(true);
  });

  /** Close is not the same: `coriandre` must not fold into `Coriandre en poudre`. */
  test("still inserts when an existing row only resembles the name", async () => {
    await created(RUTABAGA, "foodComposition");
    const second = await t.run((ctx) =>
      createIngredient(ctx, {
        ...PARSNIP,
        names: {
          fr: { value: "Rutabaga jaune", status: "edited" },
          en: { value: "Yellow swede", status: "machine" },
        },
        sourceLocale: "fr",
      }, "agent"),
    );

    expect(second.created).toBe(true);
  });

  /**
   * An alias another row already answers to is a tie written into the catalog: both rows then score
   * the same on that spelling, `MARGIN` refuses to link either, and every later shopper typing it
   * pays a model call. The row writer cannot see the catalog, so the writer of the table drops it.
   * Seen in dev: a new `garlic powder` row took `granulated garlic` from `garlic granules`.
   */
  test("drops an alias that already names or aliases another row", async () => {
    await created(RUTABAGA, "foodComposition");
    const turnip = await created({
      ...PARSNIP,
      names: {
        fr: { value: "Navet", status: "edited" },
        en: { value: "Turnip", status: "machine" },
      },
      aliases: { fr: ["chou-navet", "navet blanc"], en: ["swede", "white turnip"] },
      sourceLocale: "fr",
    }, "agent");
    const row = await t.run((ctx) => ctx.db.get(turnip));

    expect(row?.aliases).toEqual({ fr: ["navet blanc"], en: ["white turnip"] });
  });
});
