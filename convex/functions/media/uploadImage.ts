"use node"

import { compressImageAuto, cropImageFromBuffer, hasImageAlpha, imageBufferFromUrl } from "@convex/lib/media/node";
import { StorageCloud } from "@convex/lib/s3/node";
import { retryPromise } from "@shared/helpers";
import type { Infer } from "convex/values";
import { createHash } from "node:crypto";
import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { SavedImage } from "./saveImage";
import type { ActionCtx } from "@convex/procedures";
import type { IMAGE_TAGS, vUploadImage } from "@convex/schema/media";

/**
 * The work of turning one URL or base64 blob into a stored file, and the orchestration of doing
 * that for a list and recording the result.
 *
 * It lives here rather than in `router/media/images/uploadMany.ts`, where it was written, because
 * a router file is a thin binding of an access level to a handler: C1 refuses an export outside the
 * `anon · authed · admin · server · _internal` grammar, and C2 caps the file at 80 lines. Both were
 * really saying the same thing — this is domain logic, and domain logic belongs in `functions/`.
 */

type Extra = {
  userId: Id<"users"> | null,
  tags?: Infer<typeof IMAGE_TAGS>,
  autoCrop?: boolean,
  object?: {
    baseImageId: Id<"images">,
    x: number,
    y: number,
  }
}

/**
 * Fetch, crop, compress and upload a single image, and describe the row that should represent it.
 *
 * Nothing is written to the database here — the caller batches the inserts into one mutation, so
 * this returns the prepared row rather than an id.
 */
export const uploadImage = async (base64orUrl: string, extra: Extra) => {
  const buffer = await imageBufferFromUrl(base64orUrl);

  const hasAlpha = await hasImageAlpha(buffer);

  // Only an image with transparency has a subject to crop TO: cropping is driven by the alpha
  // channel, so on an opaque image it would find every pixel visible and trim nothing.
  const autoCrop = extra.autoCrop ?? true;
  const croppedImage = (hasAlpha && autoCrop) ? await cropImageFromBuffer(buffer) : undefined;
  const compressedImage = await compressImageAuto(croppedImage?.buffer ?? buffer);

  const base64Data = compressedImage.buffer.toString("base64");
  const hashBase64 = createHash("sha256").update(base64Data).digest("hex");

  const userId = extra.userId;

  const folder = userId ? StorageCloud.FOLDERS.USER(userId) : StorageCloud.FOLDERS.PUBLIC;
  const uploadedFile = await StorageCloud.uploadFile(compressedImage, folder);

  return {
    userId,
    hashBase64,
    url: uploadedFile.location,
    key: uploadedFile.key,
    width: compressedImage.width,
    height: compressedImage.height,
    size: compressedImage.size,
    mimeType: compressedImage.mimeType,
    hasAlpha: hasAlpha ?? false,
    object: extra.object,
    tags: extra.tags,
  };
}

type UploadManyArgs = {
  images: Infer<typeof vUploadImage>[],
  userId: Id<"users"> | null,
}

/**
 * Upload every image, persist them in one mutation, then queue the derived sizes.
 *
 * The sizes are scheduled rather than awaited: they are four more compressions and four more
 * uploads per image, and the caller only needs the id of the original to carry on.
 */
export const uploadManyImages = async (ctx: ActionCtx, args: UploadManyArgs): Promise<SavedImage[]> => {
  const preparedImages = await Promise.all(args.images.map((image) => {
    const url = image.url ?? image.base64;
    if (!url) throw new Error("Either url or base64 image data must be provided");

    return uploadImage(url, {
      autoCrop: image.autoCrop,
      object: image.object,
      userId: args.userId,
      tags: image.tags,
    });
  }));

  const images = await retryPromise(() => ctx.runMutation(internal.router.media.images.saveMany._internal, {
    userId: args.userId,
    images: preparedImages.map((image) => ({
      url: image.url,
      key: image.key,
      hashBase64: image.hashBase64,
      width: image.width,
      height: image.height,
      size: image.size,
      mimeType: image.mimeType,
      hasAlpha: image.hasAlpha,
      tags: image.tags,
      object: image.object,
    })),
  }));

  await ctx.scheduler.runAfter(0, internal.router.media.images.uploadSizes._internal, {
    imageIds: images.map((img) => img._id),
  });

  return images;
}
