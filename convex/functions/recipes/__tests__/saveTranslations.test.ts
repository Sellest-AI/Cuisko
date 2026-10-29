import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { TranslatedRecipe } from "@convex/agent/tools/translateRecipe";
import { hashText } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";

import schema from "../../../schema";
import { saveTranslations } from "../saveTranslations";
import { facetsOf } from "@shared/tags";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const fr = (value: string): Localized => ({
  values: { fr: value },
  meta: { fr: { status: "machine", sourceHash: hashText(value) } },
});

const ENGLISH: TranslatedRecipe = {
  locale: "en",
  recipe: {
    title: "Onion soup",
    description: "A winter soup.",
    instructions: [{ title: "Base", steps: [{ instruction: "Slice the onions.", hints: ["A mandoline is faster."] }] }],
  },
};

const seed = async (title: Localized = fr("Soupe à l'oignon")) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      userId: undefined,
      title,
      description: fr("Une soupe d'hiver."),
      instructions: fr("- Émincer les oignons."),
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "french",
      timings: {},
      // Neither is what this file tests; both are here because the columns are required.
      // `facetsOf` rather than six literals, so adding a facet does not mean editing three
      // fixtures — and so a fixture can never claim one the tag list does not support.
      search: { fr: "", en: "" },
      ...facetsOf([]),
      updatedAt: 1,
    }),
  );

const save = (recipeId: Id<"recipes">, translations: TranslatedRecipe[]) =>
  t.run((ctx) => saveTranslations(ctx, { recipeId, sourceLocale: "fr", translations }));

/** The recipe's text, from its `recipeContents` row: where the writer stores it. */
const content = async (recipeId: Id<"recipes">) =>
  (await t.run((ctx) => ctx.db.query("recipeContents").collect())).find((row) => row.recipeId === recipeId)!;

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/saveTranslations", () => {
  test("writes the translated locale into all three localized columns", async () => {
    const recipeId = await seed();

    await save(recipeId, [ENGLISH]);
    const row = await t.run((ctx) => ctx.db.get(recipeId));
    const text = await content(recipeId);

    expect(row!.title.values.en).toBe("Onion soup");
    expect(text.description.values.en).toBe("A winter soup.");
    expect(text.instructions.values.en).toContain("Slice the onions.");
  });

  test("flattens the groups back into the single string the column holds", async () => {
    const recipeId = await seed();

    await save(recipeId, [ENGLISH]);
    const text = await content(recipeId);

    expect(typeof text.instructions.values.en).toBe("string");
    expect(text.instructions.values.en).toContain("Base");
    // The translated hint is stored under its step, so the other language's cooking session shows it.
    expect(text.instructions.values.en).toContain("- Slice the onions.\n> A mandoline is faster.");
  });

  /** The seed is a row from before `recipeContents`: translating it is what moves its text. */
  test("keeps the French it translated from beside the English, and takes both off the recipe row", async () => {
    const recipeId = await seed();

    await save(recipeId, [ENGLISH]);
    const row = await t.run((ctx) => ctx.db.get(recipeId));
    const text = await content(recipeId);

    expect(text.description.values).toEqual({ fr: "Une soupe d'hiver.", en: "A winter soup." });
    expect(row!.description).toBeUndefined();
    expect(row!.instructions).toBeUndefined();
  });

  /**
   * The hash is of the SOURCE text, not of the translation. It is the only thing that lets a later
   * run notice the French title changed underneath the English one — hashing "Onion soup" here
   * would compare the English value against itself, and the staleness check could never fire.
   */
  test("marks what it wrote as machine text, hashed from the SOURCE it translated", async () => {
    const recipeId = await seed();

    await save(recipeId, [ENGLISH]);
    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.meta.en).toEqual({
      status: "machine",
      sourceHash: hashText("Soupe à l'oignon"),
    });
    expect(row!.title.meta.en!.sourceHash).not.toBe(hashText("Onion soup"));
  });

  /** What the field is FOR: re-hashing an edited source no longer matches what was stored. */
  test("leaves a stale translation detectable once the source text changes", async () => {
    const recipeId = await seed();
    await save(recipeId, [ENGLISH]);

    // Only the French value moves — patching the whole field would drop the English meta this
    // test is about.
    await t.run(async (ctx) => {
      const before = (await ctx.db.get(recipeId))!;
      await ctx.db.patch(recipeId, {
        title: { ...before.title, values: { ...before.title.values, fr: "Soupe gratinée" } },
      });
    });
    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.meta.en!.sourceHash).not.toBe(hashText(row!.title.values.fr!));
  });

  test("leaves the source locale alone", async () => {
    const recipeId = await seed();

    await save(recipeId, [ENGLISH]);
    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.values.fr).toBe("Soupe à l'oignon");
    expect(row!.title.meta.fr!.status).toBe("machine");
  });

  /** A patch and not an insert: a cook's own words survive a translation run they were not part of. */
  test("does not overwrite a locale the cook has edited themselves", async () => {
    const recipeId = await seed({
      values: { fr: "Ma soupe à moi" },
      meta: { fr: { status: "edited", sourceHash: "h" } },
    });

    await save(recipeId, [ENGLISH]);
    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.values.fr).toBe("Ma soupe à moi");
    expect(row!.title.meta.fr!.status).toBe("edited");
  });

  test("bumps updatedAt, because the row changed", async () => {
    const recipeId = await seed();

    await save(recipeId, [ENGLISH]);
    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.updatedAt).toBeGreaterThan(1);
  });

  test("writes nothing when handed no translations", async () => {
    const recipeId = await seed();

    await save(recipeId, []);
    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.values).toEqual({ fr: "Soupe à l'oignon" });
  });

  test("refuses a recipe that no longer exists", async () => {
    const recipeId = await seed();
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(save(recipeId, [ENGLISH])).rejects.toThrow(/does not exist/);
  });
});
