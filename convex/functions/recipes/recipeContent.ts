import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "@convex/procedures";
import type { Localized } from "@convex/schema/i18n";

/** The text of a recipe, every locale with its translation meta: what `recipeContents` holds. */
export type RecipeText = { description: Localized; instructions: Localized };

type ContentRow = Doc<"recipeContents">;

const toRecipeText = ({ description, instructions }: ContentRow): RecipeText => ({ description, instructions });

/**
 * The one way to find a content row: by its recipe. `.unique()` because one row per recipe is the
 * invariant `_put` holds, and a second row is a writer bug that should fail loudly on
 * the next read rather than hand back whichever row the index returns first.
 */
const _rowOf = (ctx: Pick<QueryCtx, "db">, recipeId: Id<"recipes">) =>
  ctx.db
    .query("recipeContents")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .unique();

/**
 * The text of one recipe. Throws on a recipe without a content row, which no writer produces:
 * `insertRecipe` writes both rows in one transaction.
 */
export const loadRecipeContent = async (ctx: Pick<QueryCtx, "db">, recipeId: Id<"recipes">): Promise<RecipeText> =>
  _textOf(recipeId, await _rowOf(ctx, recipeId));

const _textOf = (recipeId: Id<"recipes">, row: ContentRow | null): RecipeText => {
  if (!row) throw new ConvexError({ code: "INTERNAL", message: `Recipe ${recipeId} has no content.` });

  return toRecipeText(row);
};

/** The one writer of `recipeContents`: inserts the row of `recipeId`, or replaces its text. */
export const writeRecipeContent = async (ctx: Pick<MutationCtx, "db">, recipeId: Id<"recipes">, text: RecipeText) =>
  _put(ctx, recipeId, await _rowOf(ctx, recipeId), text);

/**
 * The text of a recipe folded into new text, for the writers that change part of it and keep the
 * rest: an edit rewrites one locale, a translation run adds others. The content row is read once
 * for both the fold and the write.
 */
export const rewriteRecipeContent = async (
  ctx: Pick<MutationCtx, "db">,
  recipeId: Id<"recipes">,
  rewrite: (text: RecipeText) => RecipeText,
) => {
  const row = await _rowOf(ctx, recipeId);

  await _put(ctx, recipeId, row, rewrite(_textOf(recipeId, row)));
};

/** The one insert or patch of a content row, for both writers above. */
const _put = async (ctx: Pick<MutationCtx, "db">, recipeId: Id<"recipes">, row: ContentRow | null, text: RecipeText) => {
  if (row) await ctx.db.patch(row._id, { ...text, updatedAt: Date.now() });
  else await ctx.db.insert("recipeContents", { recipeId, ...text, updatedAt: Date.now() });
};
