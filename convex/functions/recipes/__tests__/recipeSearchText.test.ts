import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";

import schema from "../../../schema";
import { recipeSearchText } from "../recipeSearchText";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

/**
 * One catalog row carrying the blob the seed would have written for it.
 *
 * `search` is set explicitly rather than through the serializer because that is what the row looks
 * like in the database — the point under test is that a recipe COMPOSES these, not how one is made.
 */
const catalog = (search: { en: string; fr: string }) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: search.fr, en: search.en }, meta: {} },
      search,
      category: "OTHER",
      emoji: "🥕",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    }),
  );

const build = (ingredientIds: Id<"ingredients">[], names: string[] = []) =>
  t.run((ctx) => recipeSearchText(ctx, { ingredientIds, names }));

const termsOf = (text: string | undefined) => (text ?? "").split(" ").filter(Boolean);

describe("functions/recipes/recipeSearchText", () => {
  test("writes both locales from the catalog, whatever the recipe was generated in", async () => {
    const onion = await catalog({ en: "onion", fr: "oignon" });

    const search = await build([onion]);

    expect(termsOf(search.en)).toContain("onion");
    expect(termsOf(search.fr)).toContain("oignon");
  });

  /**
   * The reason the blob is built from the ingredient's own `search` rather than from its name:
   * that string already holds the aliases, so "patates" reaches the recipe without this file
   * knowing aliases exist.
   */
  test("carries an ingredient's aliases through to the recipe", async () => {
    const potato = await catalog({ en: "potato spuds", fr: "pomme de terre patates" });

    expect(termsOf((await build([potato])).fr)).toContain("patates");
  });

  /**
   * `saveRecipe` drops a line it could not resolve, so without the raw name a recipe would be
   * unfindable by the one ingredient that makes it what it is — while that word sits in the
   * instructions the cook is reading.
   */
  test("keeps the raw name of a line that never matched the catalog", async () => {
    const search = await build([], ["nuoc-mâm"]);

    // Its TOKENS, not the name as written: the hyphen is a token boundary to the index, so
    // "nuoc-mâm" is only ever reachable as the two words the shopper's query splits into too.
    expect(termsOf(search.fr)).toContain("nuoc");
    expect(termsOf(search.fr)).toContain("mâm");
    // Folded too, because the shopper will not type the circumflex.
    expect(termsOf(search.fr)).toContain("mam");
  });

  test("de-duplicates a term two ingredients share", async () => {
    const cream = await catalog({ en: "cream", fr: "crème" });
    const sourCream = await catalog({ en: "sour cream", fr: "crème aigre" });

    const terms = termsOf((await build([cream, sourCream])).fr);

    expect(new Set(terms).size).toBe(terms.length);
  });

  /**
   * Composing blobs must not nest one joined string in another — the folded copies already inside
   * an ingredient's blob would otherwise be folded and stored again, and BM25 divides a term's
   * score by the length of the field it sits in.
   */
  test("does not re-fold the folded copies an ingredient's blob already holds", async () => {
    const cream = await catalog({ en: "cream", fr: "crème creme" });

    const terms = termsOf((await build([cream])).fr);

    expect(terms.filter((term) => term === "creme")).toHaveLength(1);
  });

  test("answers empty strings for a recipe with nothing in it", async () => {
    expect(await build([], [])).toEqual({ en: "", fr: "" });
  });

  /** A row deleted between the match and this read contributes nothing, and throws nothing. */
  test("survives an ingredient that has since been deleted", async () => {
    const onion = await catalog({ en: "onion", fr: "oignon" });
    await t.run((ctx) => ctx.db.delete(onion));

    expect(await build([onion], ["oignon"])).toEqual({ en: "oignon", fr: "oignon" });
  });
});
