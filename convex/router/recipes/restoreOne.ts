import { v } from "convex/values";

import {
  discardUploadedImages,
  persistRestoredRecipe,
} from "@convex/functions/recipes/persistRestoredRecipe";
import { type RestoredRecipe, restoreRecipe } from "@convex/functions/recipes/restoreRecipe";
import { findRestoreTarget } from "@convex/functions/recipes/findBySource";
import { internalAction, internalMutation, internalQuery } from "@convex/procedures";
import { vPortableRecipe, vRecipeLink, vRestoredPhotos } from "@convex/schema/recipePayloads";
import { vRecipeStatus } from "@convex/schema/recipes";

/**
 * One recipe from a `catalog:export` zip into this deployment's catalog, for the `catalog:restore`
 * script through a deploy key.
 *
 * An action, split as `createOne` is: the lines are resolved through the same walk a created
 * recipe's are, which may reach the datasets, the live APIs and a model, the photos are uploaded
 * (`media/images/uploadMany._internal`), and the row is then written by `_internal_persist`.
 * Internal because it writes an ownerless recipe, which no cook may do.
 *
 * @costly
 */
export const _internal = internalAction({
  args: { recipe: vPortableRecipe, photos: vRestoredPhotos },
  returns: v.object({
    recipeId: v.id("recipes"),
    created: v.boolean(),
    replaced: v.optional(v.literal(true)),
    unmatched: v.array(v.string()),
  }),
  handler: (ctx, args): Promise<RestoredRecipe> => restoreRecipe(ctx, args),
});

/**
 * The catalog recipe a restore of `url` would land on, and whether the export's `status` replaces
 * it (`restoreReplaces`). Asked by the action and by the script before anything is paid for.
 */
export const _internal_find = internalQuery({
  args: { url: v.string(), status: v.optional(vRecipeStatus) },
  returns: v.union(v.object({ recipeId: v.id("recipes"), replaceable: v.boolean() }), v.null()),
  handler: (ctx, args) => findRestoreTarget(ctx, args),
});

/** The write, called by `_internal` with the ids of the photos it has just uploaded. */
export const _internal_persist = internalMutation({
  args: {
    recipe: vPortableRecipe,
    links: v.array(vRecipeLink),
    unmatched: v.array(v.string()),
    coverImageId: v.optional(v.id("images")),
    plateImageId: v.optional(v.id("images")),
  },
  returns: v.object({ recipeId: v.id("recipes"), created: v.boolean(), replaced: v.optional(v.literal(true)) }),
  handler: (ctx, args) => persistRestoredRecipe(ctx, args),
});

/**
 * Photos uploaded for a recipe that will not be written, queued for deletion: a plate base whose
 * cut-out failed, or every photo of a recipe whose write threw.
 */
export const _internal_discardImages = internalMutation({
  args: { imageIds: v.array(v.id("images")) },
  returns: v.null(),
  handler: async (ctx, { imageIds }) => {
    await discardUploadedImages(ctx, imageIds);

    return null;
  },
});
