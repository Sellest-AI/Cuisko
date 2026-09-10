import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import schema from "../../../schema";
import { ALIAS_MAX_LENGTH, ALIASES_PER_LOCALE } from "../ingredientRow";
import { rememberAlias } from "../rememberAlias";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

/**
 * A row as the catalog holds one, with its `search` blob already correct for its name and aliases.
 *
 * Written straight to `ctx.db` rather than through `createIngredient` because that is the state
 * this function actually meets: a row somebody else wrote, which it has to read and extend without
 * being handed the facts it came from.
 */
const seedCourgette = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug: "courgette",
      name: { values: { en: "Courgette", fr: "Courgette" }, meta: {} },
      emoji: "🥒",
      aliases: { fr: ["courgettes"], en: [] },
      search: { en: "courgette", fr: "courgette courgettes" },
      category: "VEGETABLE",
      defaultUnit: "g",
      defaultQuantity: 200,
      nutrition: { calories: 17, protein: 1.2, fat: 0.3, carbohydrates: 3.1 },
      source: "seed" as const,
      updatedAt: 0,
    }),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/ingredients/rememberAlias", () => {
  /**
   * The whole point of the function: the word costs a ranker call once, and the row carries it
   * afterwards. Asserted on `search` and not only on `aliases`, because `search` is the field the
   * index actually reads — an alias stored without it is an alias no shopper can ever reach, and
   * that failure has no symptom at all (ADR 0011).
   */
  test("stores the word and re-indexes the row under it", async () => {
    const ingredientId = await seedCourgette();

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "zucchini", locale: "en",
    }))).toBe(true);

    const row = await t.run((ctx) => ctx.db.get(ingredientId));

    expect(row?.aliases?.en).toEqual(["zucchini"]);
    expect(row?.search?.en).toBe("courgette zucchini");
    expect(row?.updatedAt).toBeGreaterThan(0);
  });

  /** The other language's blob is rebuilt too, so growing one index cannot blank the other. */
  test("leaves the locale it did not touch indexed as it was", async () => {
    const ingredientId = await seedCourgette();

    await t.run((ctx) => rememberAlias(ctx, { ingredientId, alias: "zucchini", locale: "en" }));

    const row = await t.run((ctx) => ctx.db.get(ingredientId));

    expect(row?.aliases?.fr).toEqual(["courgettes"]);
    expect(row?.search?.fr).toBe("courgette courgettes");
  });

  /**
   * Two shoppers typing the same unknown word at once, and the second arriving after the first
   * wrote. A repeat costs the index nothing and would cost the row an `updatedAt` bump for no
   * change, so the write is skipped entirely rather than made idempotent by the serializer.
   */
  test("does not write when the row already knows the word", async () => {
    const ingredientId = await seedCourgette();

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "COURGETTES", locale: "fr",
    }))).toBe(false);

    expect(await t.run((ctx) => ctx.db.get(ingredientId)))
      .toMatchObject({ updatedAt: 0 });
  });

  /** A row does not need a synonym for the word it is already called. */
  test("does not store the row's own name", async () => {
    const ingredientId = await seedCourgette();

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "courgette", locale: "en",
    }))).toBe(false);
  });

  /**
   * The row was deleted between the model call and this write. It is not an error to report: the
   * shopper got their ingredient, and the only cost is that the ranker is paid again next time.
   */
  test("reports no write for a row that no longer exists", async () => {
    const ingredientId = await seedCourgette();
    await t.run((ctx) => ctx.db.delete(ingredientId));

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "zucchini", locale: "en",
    }))).toBe(false);
  });

  /** Whitespace is not a word, and a blob is not improved by a bare separator. */
  test("ignores a blank spelling", async () => {
    const ingredientId = await seedCourgette();

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "   ", locale: "en",
    }))).toBe(false);
  });

  /**
   * The two bounds, and they exist because the row is SHARED: BM25 divides by field length, so an
   * over-long blob lowers this row's score for the word everybody actually types. One shopper's
   * phrase would cost every other shopper, permanently, with no screen to undo it from.
   */
  test("refuses a spelling longer than the cap", async () => {
    const ingredientId = await seedCourgette();

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "z".repeat(ALIAS_MAX_LENGTH + 1), locale: "en",
    }))).toBe(false);

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "z".repeat(ALIAS_MAX_LENGTH), locale: "en",
    }))).toBe(true);
  });

  /**
   * A full locale refuses the new word rather than evicting an old one. Trimming to make room
   * would delete a spelling somebody has been finding this row by, to store one typed once — and
   * it would mean this write touched part of the row nobody asked it to.
   */
  test("refuses an eleventh word rather than dropping the first", async () => {
    const ingredientId = await seedCourgette();
    const full = Array.from({ length: ALIASES_PER_LOCALE }, (_, index) => `word${index}`);

    await t.run((ctx) => ctx.db.patch(ingredientId, { aliases: { en: full, fr: [] } }));

    expect(await t.run((ctx) => rememberAlias(ctx, {
      ingredientId, alias: "zucchini", locale: "en",
    }))).toBe(false);

    expect(await t.run((ctx) => ctx.db.get(ingredientId))).toMatchObject({
      aliases: { en: full },
    });
  });
});
