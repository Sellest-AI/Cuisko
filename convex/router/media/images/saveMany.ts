import { v } from "convex/values";
import { type SaveImageArgs, type SavedImage, saveImage } from "@convex/functions/media/saveImage";
import { internalMutation, type MutationCtx, serverMutation } from "@convex/procedures";
import { IMAGE_TAGS } from "@convex/schema/media";

const args = {
  userId: v.union(v.null(), v.id("users")),
  images: v.array(v.object({
    url: v.string(),
    key: v.string(),
    hashBase64: v.string(),
    width: v.number(),
    height: v.number(),
    size: v.number(),
    mimeType: v.string(),
    alt: v.optional(v.string()),
    hasAlpha: v.optional(v.boolean()),
    tags: v.optional(IMAGE_TAGS),
    object: v.optional(v.object({
      x: v.number(),
      y: v.number(),
      baseImageId: v.id("images")
    })),
  })),
}

/**
 * Written out rather than inferred from `args` above, which is the pattern the other routers use
 * (`recipes/createOne.ts`). Inferring it costs a `v.object(args)` const that exists only to be fed
 * to `Infer`, which lint reads — correctly — as an unused value.
 */
type Args = {
  userId: SaveImageArgs["userId"];
  images: Omit<SaveImageArgs, "userId">[];
};

const sharedHandler = async (ctx: MutationCtx, args: Args): Promise<SavedImage[]> => {
  const images = await Promise.all(args.images.map((arg) => saveImage(ctx, { ...arg, userId: args.userId })));

  return images;
}

export const server = serverMutation({
  args, handler: sharedHandler,
})

export const _internal = internalMutation({
  args, handler: sharedHandler,
})
