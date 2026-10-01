"use node"

import { v } from "convex/values";
import type { SavedImage } from "@convex/functions/media/saveImage";
import { uploadManyImages } from "@convex/functions/media/uploadImage";
import { enforceRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { authAction, internalAction } from "@convex/procedures";
import { vUploadImage } from "@convex/schema/media";

const args = {
  images: v.array(vUploadImage),
};

export const authed = authAction({
  args,
  handler: async (ctx, args): Promise<SavedImage[]> => {
    // A token per image, so one request cannot carry a whole batch past a limit meant for one.
    await enforceRateLimit(ctx, "imageUpload", args.images.length);

    return uploadManyImages(ctx, { ...args, userId: ctx.userId });
  },
});

/** @costly */
export const _internal = internalAction({
  args: { ...args, userId: v.union(v.null(), v.id("users")) },
  handler: uploadManyImages,
});
