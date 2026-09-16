"use node"
import { api, internal } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { generateIngredientImage } from "@convex/agent/tools/generateIngredientImage";
import { internalAction } from "@convex/procedures";
import { ConvexError, v } from "convex/values";

/**
 * Generates an ingredient's icon and persists it, replacing any image the row already had.
 *
 * `hint` exists for a manual re-run from the dashboard when the first image came out wrong: a
 * sentence like "a cut of meat, not the pasta" that the prompt-writing agent reads as authoritative.
 * The automatic call from `resolveIngredient` never sets it.
 */
export const _internal = internalAction({
  args: {
    ingredientId: v.id("ingredients"),
    userId: v.id("users"),
    hint: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"images">> => {
    const ingredient = await ctx.runQuery(api.router.ingredients.getIngredient.anon, {
      id: args.ingredientId,
      locale: "en",
    });

    const output = await generateIngredientImage.run({ ...ctx, userId: args.userId }, {
      names: { fr: [], en: [ingredient.name] },
      aliases: ingredient.aliases ? { fr: [], en: ingredient.aliases } : undefined,
      category: ingredient.category,
      hint: args.hint,
    });

    const baseImage = await ctx.runAction(internal.router.media.images.uploadMany._internal, {
      userId: null,
      images: [{
        url: output.imageUrlWithBackground,
      }]
    });

    const baseImageResult = baseImage[0];
    if (!baseImageResult) throw new ConvexError({ code: "INTERNAL", message: "Failed to upload base image" });

    const finalImage = await ctx.runAction(internal.router.media.images.uploadMany._internal, {
      userId: null,
      images: [{
        base64: output.imageAlphaBase64,
        object: {
          baseImageId: baseImageResult._id,
          x: output.position.left,
          y: output.position.top,
        },
      }]
    });

    const finalImageResult = finalImage[0];
    if (!finalImageResult) throw new ConvexError({ code: "INTERNAL", message: "Failed to upload final image" });

    await ctx.runMutation(internal.router.ingredients.generateImage._internal_persist, {
      ingredientId: args.ingredientId,
      imageId: finalImageResult._id,
    });

    return finalImageResult._id;
  }
})
