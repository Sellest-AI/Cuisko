import { internal } from "@convex/_generated/api";
import type { SavedImage } from "@convex/functions/media/saveImage";
import { enforceRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { authAction } from "@convex/procedures";
import { vUploadImage } from "@convex/schema/media";

export const authed = authAction({
  args: vUploadImage.fields,
  handler: async (ctx, args): Promise<SavedImage> => {
    await enforceRateLimit(ctx, "imageUpload");

    const images = await ctx.runAction(internal.router.media.images.uploadMany._internal, {
      userId: ctx.userId,
      images: [args],
    })

    if (!images[0]) throw new Error("Failed to upload image");

    return images[0];
  }
});
