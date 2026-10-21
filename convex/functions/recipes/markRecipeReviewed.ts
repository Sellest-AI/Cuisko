import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { assertUnchangedSince } from "./assertUnchangedSince";

type Args = {
  recipeId: Id<"recipes">;
  /** The locale the verify read the recipe in. */
  locale: Locale;
  /** `recipeFingerprint` of the recipe the verifier accepted — see `assertUnchangedSince`. */
  fingerprint: string;
};

/**
 * A verify that found nothing to correct: the recipe is accepted as it stands, so it ends
 * `reviewed` like a rewritten one does — from `generated` or `edited` alike. See `recipes.status`.
 *
 * Only the status is written. A recipe already `reviewed` is not written again, so verifying it a
 * second time does not bump `updatedAt`.
 */
export const markRecipeReviewed = async (
  ctx: MutationCtx,
  { recipeId, locale, fingerprint }: Args,
): Promise<void> => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error(`markRecipeReviewed: recipe ${recipeId} does not exist.`);
  // The check comes first even with nothing to write: a cook's FIRST edit also leaves a recipe
  // `reviewed`, so finding it `reviewed` does not mean the text the verifier judged is still there.
  await assertUnchangedSince(ctx, { recipe, locale, fingerprint });
  if (recipe.status === "reviewed") return;

  await ctx.db.patch(recipeId, { status: "reviewed", updatedAt: Date.now() });
};
