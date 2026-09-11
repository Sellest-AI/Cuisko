import type { Id } from "@convex/_generated/dataModel";
import { scheduleImageTreeDeletion } from "@convex/functions/media/imageTree";
import type { MutationCtx } from "@convex/procedures";

type ReplaceArgs = {
  recipeId: Id<"recipes">;
  coverImageId?: Id<"images">;
  plateImageId?: Id<"images">;
};

const IMAGE_FIELDS = ["coverImageId", "plateImageId"] as const;

/**
 * Point a recipe at freshly generated photos and queue the ones they replace for removal.
 *
 * Same shape as `replaceIngredientImage`, and for the same reason: the patch and the schedule commit
 * in one transaction, so the cleanup never observes the recipe still pointing at what it deletes.
 *
 * Each photo is replaced only when a new one arrived. The two are rendered independently and either
 * can fail, and a failed plate is no reason to throw away the plate the recipe already has.
 *
 * A recipe deleted while its photos were rendering has nothing left to point at them, so the new
 * ones are queued for removal instead — otherwise they would sit in the bucket with no row
 * referring to them.
 */
export const replaceRecipeImages = async (ctx: MutationCtx, args: ReplaceArgs) => {
  const recipe = await ctx.db.get(args.recipeId);

  const patch: Partial<Record<(typeof IMAGE_FIELDS)[number], Id<"images">>> = {};
  const outdatedImageIds: Id<"images">[] = [];

  for (const field of IMAGE_FIELDS) {
    const imageId = args[field];
    if (!imageId) continue;

    if (!recipe) outdatedImageIds.push(imageId);
    else {
      patch[field] = imageId;
      const previousImageId = recipe[field];
      if (previousImageId && previousImageId !== imageId) outdatedImageIds.push(previousImageId);
    }
  }

  if (recipe && Object.keys(patch).length) {
    await ctx.db.patch(args.recipeId, { ...patch, updatedAt: Date.now() });
  }

  for (const imageId of outdatedImageIds) await scheduleImageTreeDeletion(ctx, imageId);
};
