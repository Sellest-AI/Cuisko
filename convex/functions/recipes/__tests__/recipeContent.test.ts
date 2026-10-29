import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import { hashText } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";
import { facetsOf } from "@shared/tags";

import schema from "../../../schema";
import {
  loadRecipeContent,
  moveLegacyRecipeContent,
  rewriteRecipeContent,
  writeRecipeContent,
  type RecipeText,
} from "../recipeContent";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const fr = (value: string): Localized => ({
  values: { fr: value },
  meta: { fr: { status: "machine", sourceHash: hashText(value) } },
});

const SOUP: RecipeText = {
  description: fr("Une soupe d'hiver."),
  instructions: fr("## Base\n- Émincer les oignons.\n- Les faire suer 10 minutes."),
};

const EDITED_SOUP: RecipeText = {
  description: fr("Une soupe d'hiver, gratinée."),
  instructions: fr("## Base\n- Émincer les oignons.\n## Gratin\n- Passer sous le gril 5 minutes."),
};

/** A recipe row, carrying its text the way every row did before `recipeContents` existed when `legacy` is set. */
const seed = (legacy?: Partial<RecipeText>) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: fr("Soupe à l'oignon"),
      ...legacy,
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "french",
      timings: {},
      search: { fr: "", en: "" },
      ...facetsOf([]),
      updatedAt: 1,
    }),
  );

const contentRowsOf = async (recipeId: Id<"recipes">) =>
  (await t.run((ctx) => ctx.db.query("recipeContents").collect())).filter((row) => row.recipeId === recipeId);

const load = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => loadRecipeContent(ctx, (await ctx.db.get(recipeId))!));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/recipeContent", () => {
  test("writing twice for one recipe leaves one row, holding the second text", async () => {
    const recipeId = await seed();

    await t.run((ctx) => writeRecipeContent(ctx, recipeId, SOUP));
    await t.run((ctx) => writeRecipeContent(ctx, recipeId, EDITED_SOUP));

    const rows = await contentRowsOf(recipeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description.values.fr).toBe("Une soupe d'hiver, gratinée.");
    expect(rows[0]!.instructions.values.fr).toContain("Passer sous le gril 5 minutes.");
  });

  test("reads the recipe's content row", async () => {
    const recipeId = await seed();
    await t.run((ctx) => writeRecipeContent(ctx, recipeId, SOUP));

    expect(await load(recipeId)).toEqual(SOUP);
  });

  test("reads a recipe the migration has not reached from its own row", async () => {
    const recipeId = await seed(SOUP);

    expect(await load(recipeId)).toEqual(SOUP);
  });

  test("a recipe with neither a content row nor text of its own is an error, not an empty page", async () => {
    const recipeId = await seed();

    await expect(load(recipeId)).rejects.toThrow("has no content");
  });

  test("a write on a recipe the migration has not reached takes the text off its row", async () => {
    const recipeId = await seed(SOUP);

    await t.run((ctx) => writeRecipeContent(ctx, recipeId, EDITED_SOUP));

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.description).toBeUndefined();
    expect(row!.instructions).toBeUndefined();
    expect(await load(recipeId)).toEqual(EDITED_SOUP);
  });

  test("a write on a migrated recipe leaves its row untouched", async () => {
    const recipeId = await seed();
    const before = await t.run((ctx) => ctx.db.get(recipeId));

    await t.run((ctx) => writeRecipeContent(ctx, recipeId, SOUP));

    expect(await t.run((ctx) => ctx.db.get(recipeId))).toEqual(before);
  });

  describe("rewriteRecipeContent", () => {
    const appendStep = (text: RecipeText): RecipeText => ({
      ...text,
      instructions: fr(`${text.instructions.values.fr}\n- Servir bien chaud.`),
    });
    const rewrite = (recipeId: Id<"recipes">) =>
      t.run(async (ctx) => rewriteRecipeContent(ctx, (await ctx.db.get(recipeId))!, appendStep));

    test("folds onto the text of the content row and writes the result back to it", async () => {
      const recipeId = await seed();
      await t.run((ctx) => writeRecipeContent(ctx, recipeId, SOUP));

      await rewrite(recipeId);

      const rows = await contentRowsOf(recipeId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.instructions.values.fr).toBe(
        "## Base\n- Émincer les oignons.\n- Les faire suer 10 minutes.\n- Servir bien chaud.",
      );
      expect(rows[0]!.description).toEqual(SOUP.description);
    });

    test("folds onto the row's own text when the migration has not reached it, and moves it", async () => {
      const recipeId = await seed(SOUP);

      await rewrite(recipeId);

      const row = await t.run((ctx) => ctx.db.get(recipeId));
      expect(row!.instructions).toBeUndefined();
      expect((await load(recipeId)).instructions.values.fr).toContain("- Servir bien chaud.");
    });
  });

  describe("moveLegacyRecipeContent", () => {
    const move = (recipeId: Id<"recipes">) =>
      t.run(async (ctx) => moveLegacyRecipeContent(ctx, (await ctx.db.get(recipeId))!));

    test("moves the row's text into one content row and takes it off the row", async () => {
      const recipeId = await seed(SOUP);

      await move(recipeId);

      const row = await t.run((ctx) => ctx.db.get(recipeId));
      expect(row!.description).toBeUndefined();
      expect(row!.instructions).toBeUndefined();
      const rows = await contentRowsOf(recipeId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject(SOUP);
    });

    test("keeps the content row's text when a write got there first", async () => {
      const recipeId = await seed(SOUP);
      // What an edit between the deploy and the migration leaves: the newer text in its own row,
      // which `writeRecipeContent` already took off the recipe. Re-seeded onto the row here to
      // stand for a writer that raced the migration's read.
      await t.run((ctx) => ctx.db.insert("recipeContents", { recipeId, ...EDITED_SOUP, updatedAt: 2 }));

      await move(recipeId);

      const rows = await contentRowsOf(recipeId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject(EDITED_SOUP);
    });

    test("writes nothing on a recipe already moved", async () => {
      const recipeId = await seed(SOUP);
      await move(recipeId);
      const [before] = await contentRowsOf(recipeId);

      await move(recipeId);

      expect(await contentRowsOf(recipeId)).toEqual([before]);
    });

    test("refuses a row holding only part of its text rather than dropping it", async () => {
      const recipeId = await seed({ description: SOUP.description });

      await expect(move(recipeId)).rejects.toThrow("only part of its text");
      expect((await t.run((ctx) => ctx.db.get(recipeId)))!.description).toEqual(SOUP.description);
    });
  });
});
