import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import type { Id } from "@convex/_generated/dataModel";
import { hashText } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";

import { internal } from "../../../_generated/api";
import schema from "../../../schema";
import { loadRecipeContent } from "../../../functions/recipes/recipeContent";

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
      .filter(([path]) => path.startsWith("/convex/router/recipes/translateOne."))
      .map(([, load]) => load()),
  ),
);

let t: ReturnType<typeof convexTest>;

const one = (locale: "fr" | "en", value: string): Localized => ({
  values: { [locale]: value },
  meta: { [locale]: { status: "machine", sourceHash: hashText(value) } },
});

/**
 * Both languages present, so `loadForTranslation` reports nothing missing. Both `sourceHash`es are
 * the FRENCH text's hash — that is the real invariant `saveTranslations.ts` keeps: every locale a
 * translation run touches is stamped with the hash of the SOURCE it was made from, never its own.
 */
const both = (fr: string, en: string): Localized => {
  const sourceHash = hashText(fr);
  return {
    values: { fr, en },
    meta: {
      fr: { status: "machine", sourceHash },
      en: { status: "machine", sourceHash },
    },
  };
};

const seed = async (
  title: Localized,
  overrides: Partial<{ description: Localized; instructions: Localized }> = {},
) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });

    return insertTestRecipe(ctx.db, {
      userId,
      title,
      description: overrides.description ?? one("fr", "Une soupe d'hiver."),
      instructions: overrides.instructions ?? one("fr", "## Base\n- Émincer les oignons."),
      servings: 4,
      difficulty: 2,
      updatedAt: 1,
    });
  });

const read = (recipeId: Id<"recipes">) => t.run((ctx) => ctx.db.get(recipeId));

/** The recipe's text as every reader sees it, wherever it is stored. */
const textOf = (recipeId: Id<"recipes">) => t.run((ctx) => loadRecipeContent(ctx, recipeId));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/translateOne", () => {
  /**
   * The short-circuit is the whole reason `_internal` reads before it writes. `translateRecipe`
   * refuses an empty locale list, so reaching the model here would not merely waste a call — it
   * would throw. This is also the only branch of `_internal` reachable without a live model, which
   * is why the successful path is covered at the two functions it delegates to
   * (`loadForTranslation`, `saveTranslations`) rather than end to end here.
   */
  test("does nothing when the recipe is already in every language", async () => {
    const recipeId = await seed(both("Soupe à l'oignon", "Onion soup"), {
      description: both("Une soupe d'hiver.", "A winter soup."),
      instructions: both("## Base\n- Émincer les oignons.", "## Base\n- Slice the onions."),
    });

    // `null` and not `undefined`: the value crosses an action boundary, and Convex encodes an
    // absent return as null on the way back.
    await expect(
      t.action(internal.router.recipes.translateOne._internal, { recipeId, sourceLocale: "fr" }),
    ).resolves.toBeNull();

    expect((await read(recipeId))!.updatedAt).toBe(1);
  });

  test("reports the languages a recipe is still missing", async () => {
    const recipeId = await seed(one("fr", "Soupe à l'oignon"));

    const source = await t.query(internal.router.recipes.translateOne._internal_load, {
      recipeId,
      sourceLocale: "fr",
    });

    expect(source.missingLocales).toEqual(["en"]);
    expect(source.recipe.title).toBe("Soupe à l'oignon");
  });

  /** The heading survives the parse because `serializeInstructions` marked it — see shared/recipes. */
  test("hands the model the instructions as groups, hints on their step, not as the stored string", async () => {
    const recipeId = await seed(one("fr", "Soupe à l'oignon"), {
      instructions: one("fr", "## Base\n- Émincer les oignons.\n> Une mandoline va plus vite.\n- Servir."),
    });

    const source = await t.query(internal.router.recipes.translateOne._internal_load, {
      recipeId,
      sourceLocale: "fr",
    });

    expect(source.recipe.instructions).toEqual([
      {
        title: "Base",
        steps: [
          { instruction: "Émincer les oignons.", hints: ["Une mandoline va plus vite."] },
          { instruction: "Servir.", hints: [] },
        ],
      },
    ]);
  });

  test("writes a translation back against the source it was made from", async () => {
    const recipeId = await seed(one("fr", "Soupe à l'oignon"));

    await t.mutation(internal.router.recipes.translateOne._internal_persist, {
      recipeId,
      sourceLocale: "fr",
      translations: [
        {
          locale: "en",
          recipe: {
            title: "Onion soup",
            description: "A winter soup.",
            instructions: [
              { title: "Base", steps: [{ instruction: "Slice the onions.", hints: ["A mandoline is faster."] }] },
            ],
          },
        },
      ],
    });

    const row = await read(recipeId);

    expect(row!.title.values.en).toBe("Onion soup");
    expect((await textOf(recipeId)).instructions.values.en).toBe("## Base\n- Slice the onions.\n> A mandoline is faster.");
    // The source's hash, not the translation's — what makes the English stale if the French moves.
    expect(row!.title.meta.en!.sourceHash).toBe(hashText("Soupe à l'oignon"));
  });

  test("refuses a recipe that no longer exists", async () => {
    const recipeId = await seed(one("fr", "Soupe à l'oignon"));
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(
      t.query(internal.router.recipes.translateOne._internal_load, { recipeId, sourceLocale: "fr" }),
    ).rejects.toThrow(/does not exist/);
  });
});
