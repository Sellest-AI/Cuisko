"use node"

import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { StorageCloud } from "@convex/lib/s3/node";
import type { ActionCtx } from "@convex/procedures";
import { notEmpty } from "@shared/helpers";

/**
 * The bucket half of deleting an image — see the note in `deleteImage.ts` for why the two halves
 * are separate files rather than one. This one talks to S3, so it is `"use node"` and no mutation
 * can import it.
 */

/**
 * Remove every stored file behind an image: its own original, the objects placed on it, and the
 * renditions of all of them.
 *
 * Returns the keys it removed, and the caller is expected to hand that list to
 * `deleteOneMutationInternal` — see the doc block there for why the list is an argument and not a
 * comment. The renditions of an object used to be left in the bucket; only its original was
 * removed.
 */
export const deleteStoredImageFiles = async (ctx: ActionCtx, imageId: Id<"images">) => {
  const image = await ctx.runQuery(internal.router.media.images.getOne._internal, { id: imageId });
  if (!image) return null;

  const objects = await Promise.all(image.objects.map((object) =>
    ctx.runQuery(internal.router.media.images.getOne._internal, { id: object.imageId })));

  const deletedKeys: string[] = [];
  for (const target of [image, ...objects.filter(notEmpty)]) {
    await StorageCloud.deleteFile(target.key);
    deletedKeys.push(target.key);

    for (const size of target._sizes) {
      await StorageCloud.deleteFile(size.key);
      deletedKeys.push(size.key);
    }
  }

  return deletedKeys;
};
