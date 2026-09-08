"use node"

import { deleteStoredImageFiles } from "@convex/functions/media/deleteImageFiles";
import { v } from "convex/values";
import { internalAction } from "@convex/procedures";

/**
 * The bucket half of `deleteOne`, split out because it is the only part that needs node.
 *
 * It exists as its own action rather than as a call inside `deleteOne._internal` because
 * `deleteStoredImageFiles` reaches S3 through `lib/s3/node`: importing it makes the whole module
 * `"use node"`, and a `"use node"` module cannot export the mutation that finishes the sequence.
 * Returns the keys it removed, which the caller must hand to `deleteOne._internal_persist`.
 */
export const _internal = internalAction({
  args: { imageId: v.id("images") },
  handler: (ctx, { imageId }) => deleteStoredImageFiles(ctx, imageId),
})
