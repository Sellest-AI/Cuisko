"use node"
import { internal } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { generateRecipeImages } from "@convex/agent/tools/generateRecipeImages";
import { internalAction } from "@convex/procedures";
import { serializeInstructions } from "@shared/recipes";
import { ConvexError, v } from "convex/values";

/** @costly */
export const _internal = internalAction({
  args: {
    recipeId: v.id("recipes"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<{ plateImageId: Id<"images"> | null; coverImageId: Id<"images"> | null }> => {
    const recipe = await ctx.runQuery(internal.router.recipes.getOne._internal, {
      id: args.recipeId,
      locale: "en",
    })

    const result = await generateRecipeImages.run({ ...ctx, userId: args.userId }, {
      name: recipe.title,
      description: recipe.description,
      instructions: serializeInstructions(recipe.instructions),
      ingredients: recipe.ingredients.map((ingredient) => ingredient.name).join(", "),
    })

    let plateImageId: Id<"images"> | null = null;

    if (result.plateImage) {
      const basePlateImages = await ctx.runTracedAction(internal.router.media.images.uploadMany._internal, {
        userId: null,
        images: [{ url: result.plateImage.withBackground }]
      });

      const basePlateImage = basePlateImages[0];
      if (!basePlateImage) throw new ConvexError({ code: "INTERNAL", message: "Failed to upload base image" });

      const finalImage = await ctx.runTracedAction(internal.router.media.images.uploadMany._internal, {
        userId: null,
        images: [{
          base64: result.plateImage.withoutBackground,
          object: {
            baseImageId: basePlateImage._id,
            x: result.plateImage.position.left,
            y: result.plateImage.position.top,
          },
        }]
      });

      plateImageId = finalImage[0]?._id ?? null;
    }

    let coverImageId: Id<"images"> | null = null;

    if (result.coverImage) {
      const coverPlateImages = await ctx.runTracedAction(internal.router.media.images.uploadMany._internal, {
        userId: null,
        images: [{ url: result.coverImage }]
      });

      const coverPlateImage = coverPlateImages[0];
      if (!coverPlateImage) throw new ConvexError({ code: "INTERNAL", message: "Failed to upload cover image" });

      coverImageId = coverPlateImage._id;
    }

    await ctx.runMutation(internal.router.recipes.createOne._internal_persistImages, {
      recipeId: args.recipeId,
      plateImageId: plateImageId ?? undefined,
      coverImageId: coverImageId ?? undefined,
    });

    return { plateImageId, coverImageId }
  }
})
