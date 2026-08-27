import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import { hashText } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";
import { serializeInstructions } from "@shared/recipes";

import schema from "../../../schema";
import { loadForTranslation } from "../loadForTranslation";
import { facetsOf } from "@shared/tags";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const fr = (value: string): Localized => ({
  values: { fr: value },
  meta: { fr: { status: "machine", sourceHash: hashText(value) } },
});

const INSTRUCTIONS = serializeInstructions([
  { title: "Base", steps: ["Émincer les oignons.", "Les faire suer."] },
  { steps: ["Servir."] },
]);

/** A full French → English translation, every locale's `sourceHash` matching the French it came from. */
const TRANSLATED = {
  title: {
    values: { fr: "Soupe à l'oignon", en: "Onion soup" },
    meta: {
      fr: { status: "machine" as const, sourceHash: hashText("Soupe à l'oignon") },
      en: { status: "machine" as const, sourceHash: hashText("Soupe à l'oignon") },
    },
  },
  description: {
    values: { fr: "Une soupe d'hiver.", en: "A winter soup." },
    meta: {
      fr: { status: "machine" as const, sourceHash: hashText("Une soupe d'hiver.") },
      en: { status: "machine" as const, sourceHash: hashText("Une soupe d'hiver.") },
    },
  },
  instructions: {
    values: { fr: INSTRUCTIONS, en: "## Base\n- Slice the onions.\n- Sweat them.\n\n- Serve." },
    meta: {
      fr: { status: "machine" as const, sourceHash: hashText(INSTRUCTIONS) },
      en: { status: "machine" as const, sourceHash: hashText(INSTRUCTIONS) },
    },
  },
};

/**
 * One French recipe with two ingredients, deliberately linked out of order.
 *
 * `position` is the list the cook reads, and `_creationTime` is not — inserting the second line
 * first is what makes the glossary's ordering an assertion rather than a coincidence.
 */
const seed = async (overrides: { userId?: Id<"users"> | null } = {}) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });

    const catalog = async (frName: string, en: string | undefined) =>
      ctx.db.insert("ingredients", {
        name: { values: { fr: frName, ...(en ? { en } : {}) }, meta: {} },
        category: "OTHER",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      });

    const onion = await catalog("oignon", "onion");
    const perlimpinpin = await catalog("poudre de perlimpinpin", undefined);

    const recipeId = await ctx.db.insert("recipes", {
      userId: overrides.userId === null ? undefined : (overrides.userId ?? userId),
      title: fr("Soupe à l'oignon"),
      description: fr("Une soupe d'hiver."),
      instructions: fr(INSTRUCTIONS),
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: ["soup"],
      cuisine: "french",
      timings: { preparation: 15 },
      // Neither is what this file tests; both are here because the columns are required.
      // `facetsOf` rather than six literals, so adding a facet does not mean editing three
      // fixtures — and so a fixture can never claim one the tag list does not support.
      search: { fr: "", en: "" },
      ...facetsOf([]),
      updatedAt: Date.now(),
    });

    const link = (ingredientId: Id<"ingredients">, position: number) =>
      ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId,
        position,
        quantity: 1,
        unit: "pcs",
        updatedAt: Date.now(),
      });

    await link(perlimpinpin, 1);
    await link(onion, 0);

    return { recipeId, userId };
  });

const load = (recipeId: Id<"recipes">) =>
  t.run((ctx) => loadForTranslation(ctx, { recipeId, sourceLocale: "fr" }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/loadForTranslation", () => {
  test("resolves the localized fields from the source locale", async () => {
    const { recipeId } = await seed();

    const source = await load(recipeId);

    expect(source.recipe.title).toBe("Soupe à l'oignon");
    expect(source.recipe.description).toBe("Une soupe d'hiver.");
  });

  test("hands the instructions back as groups, not as the stored blob", async () => {
    const { recipeId } = await seed();

    const source = await load(recipeId);

    expect(source.recipe.instructions).toEqual([
      { title: "Base", steps: ["Émincer les oignons.", "Les faire suer."] },
      { steps: ["Servir."] },
    ]);
  });

  test("carries the language-independent fields through as context", async () => {
    const { recipeId } = await seed();

    const source = await load(recipeId);

    expect(source.recipe.servings).toBe(4);
    expect(source.recipe.cuisine).toBe("french");
    expect(source.recipe.tags).toEqual(["soup"]);
  });

  test("builds the glossary in position order, with every name the catalog holds", async () => {
    const { recipeId } = await seed();

    const source = await load(recipeId);

    expect(source.recipe.ingredients).toEqual([
      { names: { fr: "oignon", en: "onion" } },
      { names: { fr: "poudre de perlimpinpin" } },
    ]);
  });

  test("carries no quantity and no unit — the numbers come from the step being translated", async () => {
    const { recipeId } = await seed();

    const source = await load(recipeId);

    expect(Object.keys(source.recipe.ingredients[0]!)).toEqual(["names"]);
  });

  test("reports the locales the recipe is still missing", async () => {
    const { recipeId } = await seed();

    expect((await load(recipeId)).missingLocales).toEqual(["en"]);
  });

  test("reports nothing missing once every locale is translated", async () => {
    const { recipeId } = await seed();
    await t.run((ctx) => ctx.db.patch(recipeId, TRANSLATED));

    expect((await load(recipeId)).missingLocales).toEqual([]);
  });

  /**
   * The case `hasTranslation` alone cannot see: `values.en` and its `meta` are exactly as a
   * finished translation left them, and only the FRENCH title has moved since. Nothing about the
   * English entry itself says it is wrong — its `sourceHash` is what proves it was made from a
   * title that no longer exists.
   */
  test("reports a locale as missing again once the source it was translated from changes", async () => {
    const { recipeId } = await seed();
    await t.run((ctx) => ctx.db.patch(recipeId, TRANSLATED));

    const editedTitle = "Soupe à l'oignon gratinée";
    await t.run((ctx) =>
      ctx.db.patch(recipeId, {
        title: {
          values: { fr: editedTitle, en: TRANSLATED.title.values.en },
          meta: {
            fr: { status: "edited", sourceHash: hashText(editedTitle) },
            en: TRANSLATED.title.meta.en,
          },
        },
      }),
    );

    expect((await load(recipeId)).missingLocales).toEqual(["en"]);
  });

  /** A run that failed left a value behind. Treating it as done is how a retry never happens. */
  test("still reports a locale whose last translation failed", async () => {
    const { recipeId } = await seed();
    await t.run((ctx) =>
      ctx.db.patch(recipeId, {
        title: {
          values: { fr: "Soupe à l'oignon", en: "" },
          meta: {
            fr: { status: "machine", sourceHash: hashText("Soupe à l'oignon") },
            en: { status: "failed", sourceHash: hashText("Soupe à l'oignon") },
          },
        },
      }),
    );

    expect((await load(recipeId)).missingLocales).toEqual(["en"]);
  });

  test("returns the owner, because the translation runs on their thread", async () => {
    const { recipeId, userId } = await seed();

    expect((await load(recipeId)).userId).toBe(userId);
  });

  test("refuses a recipe with no owner rather than translating on nobody's thread", async () => {
    const { recipeId } = await seed({ userId: null });

    await expect(load(recipeId)).rejects.toThrow(/no owner/);
  });

  test("refuses a recipe that no longer exists", async () => {
    const { recipeId } = await seed();
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(load(recipeId)).rejects.toThrow(/does not exist/);
  });
});
