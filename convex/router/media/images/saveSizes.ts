import { v } from "convex/values";
import { saveImageSize } from "@convex/functions/media/saveImage";
import { internalMutation, MutationCtx, serverMutation } from "@convex/procedures";
import { Id } from "@convex/_generated/dataModel";

const args = {
  images: v.array(v.object({
    imageId: v.id("images"), // Reference to the parent Image
    sizes: v.array(v.object({
      quality: v.number(),
      key: v.string(), // Unique key
      width: v.number(),
      height: v.number(),
      url: v.string(),
      size: v.number(),
    }))
  }))
}

/** Written out rather than inferred — see the note on `Args` in `saveMany.ts`. */
type Args = {
  images: {
    imageId: Id<"images">;
    sizes: { quality: number; key: string; width: number; height: number; url: string; size: number }[];
  }[];
};

type ReturnType = Promise<{ size: number; _id: Id<"images"> }[]>

const sharedHandler = async (ctx: MutationCtx, args: Args): ReturnType => {
  const images = await Promise.all(args.images.map(async (image) => {
    const sizes = image.sizes;
    await Promise.all(sizes.map((size) => saveImageSize(ctx, { ...size, imageId: image.imageId })));

    return {
      size: sizes.reduce((acc, size) => acc + size.size, 0),
      _id: image.imageId,
    }
  }))

  return images;
}

export const server = serverMutation({
  args, handler: sharedHandler,
})

export const _internal = internalMutation({
  args, handler: sharedHandler,
})
