import { v } from "convex/values";
import { publicQuery, internalQuery } from "@convex/procedures";
import { getImage, getImageWithObjects } from "@convex/functions/media/getImage";

const sharedArgs = {
  id: v.id("images"),
}

export const anon = publicQuery({
  args: sharedArgs, handler: (ctx, args) => getImage(ctx, args.id)
})

export const _internal = internalQuery({
  args: sharedArgs, handler: (ctx, args) => getImageWithObjects(ctx, args.id)
})
