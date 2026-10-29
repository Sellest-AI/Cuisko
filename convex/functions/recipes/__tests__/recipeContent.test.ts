import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import { hashText } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";
import { facetsOf } from "@shared/tags";

import schema from "../../../schema";
import {
  loadRecipeContent,
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

/** A recipe row with no content row yet: each test writes the text it needs. */
const seed = () =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: fr("Soupe à l'oignon"),
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
  t.run((ctx) => loadRecipeContent(ctx, recipeId));

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

  test("a recipe without a content row is an error, not an empty page", async () => {
    const recipeId = await seed();

    await expect(load(recipeId)).rejects.toThrow("has no content");
  });

  describe("rewriteRecipeContent", () => {
    const appendStep = (text: RecipeText): RecipeText => ({
      ...text,
      instructions: fr(`${text.instructions.values.fr}\n- Servir bien chaud.`),
    });
    const rewrite = (recipeId: Id<"recipes">) =>
      t.run((ctx) => rewriteRecipeContent(ctx, recipeId, appendStep));

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
  });
});
