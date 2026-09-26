import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "@convex/procedures";

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

/** A cut-out as an export spells it: its URL, the URL of the base it was cut from, and its offset. */
export type ImagePair = { url: string; base: { url: string }; x: number; y: number };

/**
 * The cut-out `imageId` names with the base render it was cut from and where it sits on it, or
 * nothing when the id is absent, its row is gone, or it has no base.
 *
 * `generateImages` and `generateImageNode` both upload a cut-out as an object on its base, so the
 * pair is one `imageObjects` row away. A restore rebuilds it the same way, base first and cut-out
 * on it, so a cut-out whose base cannot be found is answered as no image rather than half of one.
 *
 * A dangling id is not thrown on: the cascade detaches a deleted image from its owner in a
 * scheduled step, and an export that lands in between should still export the owner.
 */
export const imagePairOf = async (
  ctx: Pick<QueryCtx, "db">,
  imageId: Id<"images"> | undefined,
): Promise<ImagePair | undefined> => {
  const image = imageId ? await ctx.db.get(imageId) : null;
  if (!image) return undefined;

  const object = await ctx.db
    .query("imageObjects")
    .withIndex("by_image_id", (q) => q.eq("imageId", image._id))
    .first();
  const base = object ? await ctx.db.get(object.baseImageId) : null;
  if (!object || !base) return undefined;

  return { url: image.url, base: { url: base.url }, x: object.x, y: object.y };
};
