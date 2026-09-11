import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

/**
 * Queue the removal of the tree `imageId` belongs to: its base render when it was cut from one,
 * itself when it was not.
 *
 * Its own file rather than a neighbour of `deleteImageRowsAfterFilesRemoved`, because `cascade.ts`
 * calls it for `"delete-image-tree"` rules and `deleteImage.ts` imports `cascade.ts` — living there
 * would make the two import each other.
 *
 * Scheduled rather than awaited: deleting the files is four bucket round-trips per image and the
 * caller — a shopper who just got a new photo — has no reason to wait for the old one to go.
 *
 * A cut-out is aimed at its BASE image, not at `imageId` itself. The ingredient points at the
 * transparent cut-out; the white-background render it was cut from is its base, and deleting the
 * base cascades to the cut-out. Aiming at the cut-out instead would strand the render in the
 * bucket forever.
 *
 * An image with no `imageObjects` row — a recipe's cover, which is kept as rendered — is its own
 * root, so it is the one deleted. Scheduling nothing there would leak every replaced cover.
 */
export const scheduleImageTreeDeletion = async (ctx: MutationCtx, imageId: Id<"images">) => {
  const objects = await ctx.db
    .query("imageObjects")
    .withIndex("by_image_id", (q) => q.eq("imageId", imageId))
    .collect();

  const rootIds = objects.length ? objects.map((object) => object.baseImageId) : [imageId];

  for (const rootId of rootIds) {
    await ctx.scheduler.runAfter(0, internal.router.media.images.deleteOne._internal, {
      imageId: rootId,
    });
  }
};
