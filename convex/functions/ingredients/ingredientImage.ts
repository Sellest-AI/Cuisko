import type { Id } from "@convex/_generated/dataModel";
import { scheduleImageTreeDeletion } from "@convex/functions/media/deleteImage";
import type { MutationCtx } from "@convex/procedures";

type ReplaceArgs = {
  ingredientId: Id<"ingredients">;
  imageId: Id<"images">;
};

/**
 * Point an ingredient at a freshly generated photo and queue the one it replaces for removal.
 *
 * The order matters and is the reason both halves live in one function. The patch and the schedule
 * commit in the same transaction, and Convex runs a scheduled function only once that transaction
 * commits — so the cleanup can never observe the ingredient still pointing at the image it is
 * about to delete. Splitting these across two calls at the call site would put that guarantee in
 * the caller's hands.
 *
 * Reading the old id before the patch is what makes it recoverable at all; afterwards the pointer
 * is gone and the previous render would be stranded in the bucket with nothing referring to it.
 */
export const replaceIngredientImage = async (ctx: MutationCtx, args: ReplaceArgs) => {
  const ingredient = await ctx.db.get(args.ingredientId);

  await ctx.db.patch(args.ingredientId, { imageId: args.imageId, updatedAt: Date.now() });

  const outdatedImageId = ingredient?.imageId;
  if (outdatedImageId) await scheduleImageTreeDeletion(ctx, outdatedImageId);
};
