import type { Id } from "@convex/_generated/dataModel";
import { cascadeDelete } from "@convex/functions/cascade";
import type { MutationCtx } from "@convex/procedures";
import { getImageWithObjects } from "./getImage";

/**
 * The database half of deleting an image: which rows go, and which image tree gets queued.
 *
 * The bucket half lives in `deleteImageFiles.ts` and cannot be merged into this file. That one
 * reaches S3 through `lib/s3/node`, so it carries `"use node"`, and a `"use node"` module cannot
 * be imported by a mutation — which is exactly the constraint that split
 * `deleteOne.ts` from `deleteOneNode.ts` in the router. The concept is one; the runtime is two.
 */

/**
 * Delete an image row, the objects placed on it, and everything the schema hangs off both.
 *
 * The name carries the precondition because the ordering is not recoverable from the code: the
 * caller must already have removed the files from the bucket. A row without its file draws a
 * broken tile; a file without its row is invisible and merely costs storage. Rows last is the
 * cheaper failure if the sequence dies halfway.
 *
 * Every dependent row goes through `cascadeDelete` rather than being deleted by hand. The
 * hand-written version deleted the renditions, the objects placed on this image and the user
 * links — and missed the two it could not see: the `imageObjects` row in which this image is
 * itself the placed object, and the `ingredients.imageId` pointing back at it, which was left
 * dangling at a row that no longer existed.
 */
export const deleteImageRowsAfterFilesRemoved = async (ctx: MutationCtx, imageId: Id<"images">) => {
  const image = await getImageWithObjects(ctx, imageId);
  if (!image) return;

  // The objects placed on this image are images in their own right — deleting the background they
  // sit on leaves them pointing at nothing, and their files have already been removed by the
  // action that called this. The link row goes with them, via their own cascade.
  for (const object of image.objects) {
    await cascadeDelete(ctx, "images", object.imageId);
  }

  await cascadeDelete(ctx, "images", imageId);
};
