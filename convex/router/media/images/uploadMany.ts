"use node"

import { v } from "convex/values";
import type { SavedImage } from "@convex/functions/media/saveImage";
import { uploadManyImages } from "@convex/functions/media/uploadImage";
import { authAction, internalAction } from "@convex/procedures";
import { vUploadImage } from "@convex/schema/media";

const args = {
  images: v.array(vUploadImage),
};

export const authed = authAction({
  args,
  handler: (ctx, args): Promise<SavedImage[]> =>
    uploadManyImages(ctx, { ...args, userId: ctx.userId }),
});

export const _internal = internalAction({
  args: { ...args, userId: v.union(v.null(), v.id("users")) },
  handler: uploadManyImages,
});
