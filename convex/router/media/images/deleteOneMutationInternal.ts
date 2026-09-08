import { v } from "convex/values";
import { deleteImageRowsAfterFilesRemoved } from "@convex/functions/media/deleteImage";
import { internalMutation } from "@convex/procedures";

/**
 * INTERNAL ONLY. Do not call directly. Use deleteOne action instead.
 *
 * `deletedKeys` is what makes that sentence enforceable rather than advisory. The handler never
 * reads it — do not "clean it up". It is the list of storage keys the calling action has already
 * removed from the bucket, and requiring it means a caller cannot reach this mutation without
 * having done the file deletion first: there is nothing honest to pass. A doc comment is read by
 * whoever opens this file, which is never the person who gets the ordering wrong; an argument is
 * read at the call site, which is.
 */
export const _internal = internalMutation({
  args: {
    imageId: v.id("images"),
    deletedKeys: v.array(v.string()),
  },
  handler: (ctx, { imageId }) => deleteImageRowsAfterFilesRemoved(ctx, imageId),
})
