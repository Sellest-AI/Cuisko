import { v } from "convex/values";
import { internal } from "@convex/_generated/api";
import { internalAction, internalMutation } from "@convex/procedures";
import { deleteImageRowsAfterFilesRemoved } from "@convex/functions/media/deleteImage";

/**
 * Removes an image, the objects placed on it, and every stored file behind them.
 *
 * The files go first and the rows second — see `functions/media/deleteImage.ts` for why that order
 * is the cheaper failure, and why `deletedKeys` travels to the mutation as an argument.
 *
 * The bucket half is a hop rather than a call: it reaches S3 through `lib/s3/node`, so it carries
 * `"use node"` and lives in `deleteOneNode.ts`. This file stays out of the node runtime so that the
 * mutation below can sit beside the sequence that orders it.
 */
export const _internal = internalAction({
  args: { imageId: v.id("images") },
  handler: async (ctx, { imageId }) => {
    const deletedKeys = await ctx.runAction(internal.router.media.images.deleteOneNode._internal, { imageId });
    if (!deletedKeys) return null;

    await ctx.runMutation(internal.router.media.images.deleteOne._internal_persist, {
      imageId,
      deletedKeys,
    });
  },
})

/**
 * INTERNAL ONLY. Do not call directly. Use `_internal` above instead.
 *
 * `deletedKeys` is what makes that sentence enforceable rather than advisory. The handler never
 * reads it — do not "clean it up". It is the list of storage keys the calling action has already
 * removed from the bucket, and requiring it means a caller cannot reach this mutation without
 * having done the file deletion first: there is nothing honest to pass. A doc comment is read by
 * whoever opens this file, which is never the person who gets the ordering wrong; an argument is
 * read at the call site, which is.
 */
export const _internal_persist = internalMutation({
  args: {
    imageId: v.id("images"),
    deletedKeys: v.array(v.string()),
  },
  handler: (ctx, { imageId }) => deleteImageRowsAfterFilesRemoved(ctx, imageId),
})
