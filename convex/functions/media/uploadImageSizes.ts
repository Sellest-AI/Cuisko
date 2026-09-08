"use node"

import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { compressImage } from "@convex/lib/media/node";
import { StorageCloud } from "@convex/lib/s3/node";
import type { ActionCtx } from "@convex/procedures";
import { plannedImageSizes } from "./imageSizes";

/**
 * Render and store the renditions an image is missing.
 *
 * Which ones those are is `plannedImageSizes`' decision, kept in a separate module so it can be
 * tested without sharp or a bucket — this file is `"use node"` and nothing in the edge-runtime
 * test project can import it.
 *
 * Nothing is written to the database here; the rows are returned so the caller can insert every
 * image's sizes in one mutation rather than one per rendition.
 */
export const uploadImageSizes = async (ctx: ActionCtx, imageId: Id<"images">) => {
  const image = await ctx.runQuery(internal.router.media.images.getOne._internal, { id: imageId });
  if (!image) return [];

  await StorageCloud.updateCacheControl(image.key);

  const steps = plannedImageSizes({
    width: image.width,
    height: image.height,
    existing: image._sizes,
  });

  return Promise.all(steps.map(async ({ px, quality }) => {
    const buffer = await compressImage(image.url, { maxSideSize: px, quality });

    const directory = StorageCloud.FOLDERS.getFromKey(image.key);
    const file = await StorageCloud.uploadFile(buffer, directory);

    await StorageCloud.updateCacheControl(file.key);

    return {
      key: file.key,
      quality: quality,
      size: buffer.metadata.size ?? file.Size ?? image.size,
      width: buffer.metadata.width ?? image.width,
      height: buffer.metadata.height ?? image.height,
      url: file.location,
    };
  }));
};
