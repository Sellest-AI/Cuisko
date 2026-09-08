"use node"

import { deleteStoredImageFiles } from "@convex/functions/media/deleteImageFiles";
import { v } from "convex/values";
import { internal } from "@convex/_generated/api";
import { internalAction } from "@convex/procedures";

/**
 * Removes an image, the objects placed on it, and every stored file behind them.
 *
 * The files go first and the rows second — see `functions/media/deleteImage.ts` for why that order
 * is the cheaper failure, and why `deletedKeys` travels to the mutation as an argument.
 */
export const _internal = internalAction({
  args: { imageId: v.id("images") },
  handler: async (ctx, { imageId }) => {
    const deletedKeys = await deleteStoredImageFiles(ctx, imageId);
    if (!deletedKeys) return null;

    await ctx.runMutation(internal.router.media.images.deleteOneMutationInternal._internal, {
      imageId,
      deletedKeys,
    });
  },
})
