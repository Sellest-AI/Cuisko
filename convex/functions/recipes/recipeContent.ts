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
 * The text of one recipe.
 *
 * Takes the row rather than the id, so a caller that already read it pays no second read of
 * `recipes`. Falls back to the row's own two fields while `moveRecipeContent` has not reached it:
 * without that, every recipe opened between the deploy and the end of the migration would fail to
 * load. The fallback goes with the two fields, in the deploy that removes them.
 *
 * Throws on a recipe with neither, which no writer produces: `insertRecipe` writes both rows in one
 * transaction.
 */
export const loadRecipeContent = async (ctx: Pick<QueryCtx, "db">, recipe: Doc<"recipes">): Promise<RecipeText> =>
  _textOf(recipe, await _rowOf(ctx, recipe._id));

/** The text from the content row when there is one, else from the recipe row (see `loadRecipeContent`). */
const _textOf = (recipe: Doc<"recipes">, row: ContentRow | null): RecipeText => {
  if (row) return toRecipeText(row);

  const { description, instructions } = recipe;
  if (description && instructions) return { description, instructions };

  throw new ConvexError({ code: "INTERNAL", message: `Recipe ${recipe._id} has no content.` });
};

/**
 * Unsets the two fields a recipe row held before `recipeContents` existed, when it still holds them.
 *
 * A row already without them is not written: a patch of `recipes` re-runs every list subscribed to
 * it, and that is a cost to pay once per recipe, not once per edit. `updatedAt` is left alone,
 * because nothing the cook can see changed.
 */
const _dropLegacyText = async (ctx: Pick<MutationCtx, "db">, recipeId: Id<"recipes">) => {
  const recipe = await ctx.db.get(recipeId);
  if (recipe?.description === undefined && recipe?.instructions === undefined) return;

  await ctx.db.patch(recipeId, { description: undefined, instructions: undefined });
};

/**
 * The one writer of `recipeContents`: inserts the row of `recipeId`, or replaces its text.
 *
 * A legacy recipe written to before the migration reaches it is migrated by the write itself: the
 * two fields on its row are unset, so the migration later finds nothing left to move and keeps this
 * text rather than the old one.
 */
export const writeRecipeContent = async (ctx: Pick<MutationCtx, "db">, recipeId: Id<"recipes">, text: RecipeText) =>
  _put(ctx, recipeId, await _rowOf(ctx, recipeId), text);

/**
 * The text of a recipe folded into new text, for the writers that change part of it and keep the
 * rest: an edit rewrites one locale, a translation run adds others. The content row is read once
 * for both the fold and the write.
 */
export const rewriteRecipeContent = async (
  ctx: Pick<MutationCtx, "db">,
  recipe: Doc<"recipes">,
  rewrite: (text: RecipeText) => RecipeText,
) => {
  const row = await _rowOf(ctx, recipe._id);

  await _put(ctx, recipe._id, row, rewrite(_textOf(recipe, row)));
};

/** The one insert or patch of a content row, for every writer above and the migration's step. */
const _put = async (ctx: Pick<MutationCtx, "db">, recipeId: Id<"recipes">, row: ContentRow | null, text: RecipeText) => {
  if (row) await ctx.db.patch(row._id, { ...text, updatedAt: Date.now() });
  else await ctx.db.insert("recipeContents", { recipeId, ...text, updatedAt: Date.now() });

  await _dropLegacyText(ctx, recipeId);
};

/**
 * `moveRecipeContent`'s step for one recipe: its row's text into `recipeContents`, then off the row.
 *
 * A recipe that already has a content row keeps that row's text. Only a write since the deploy
 * creates one, and that write is newer than what the row still holds. Idempotent: a row without the
 * two fields is not written.
 */
export const moveLegacyRecipeContent = async (ctx: Pick<MutationCtx, "db">, recipe: Doc<"recipes">) => {
  const { description, instructions } = recipe;
  if (description === undefined && instructions === undefined) return;

  if (await _rowOf(ctx, recipe._id)) return _dropLegacyText(ctx, recipe._id);

  // Both were required until this table existed, so one without the other is not a row to guess at.
  if (!description || !instructions)
    throw new ConvexError({ code: "INTERNAL", message: `Recipe ${recipe._id} holds only part of its text.` });

  await _put(ctx, recipe._id, null, { description, instructions });
};
