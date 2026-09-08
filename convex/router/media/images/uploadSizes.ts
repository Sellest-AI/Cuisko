"use node"

import { uploadImageSizes } from "@convex/functions/media/uploadImageSizes";
import { retryPromise } from "@shared/helpers";
import { v } from "convex/values";
import { internal } from "@convex/_generated/api";
import { internalAction } from "@convex/procedures";

export const _internal = internalAction({
  args: { imageIds: v.array(v.id("images")) },
  handler: async (ctx, args) => {
    const images = await Promise.all(args.imageIds.map(async (imageId) => ({
      imageId,
      sizes: await uploadImageSizes(ctx, imageId),
    })));

    await retryPromise(() =>
      ctx.runMutation(internal.router.media.images.saveSizes._internal, { images }));

    return true;
  }
})
