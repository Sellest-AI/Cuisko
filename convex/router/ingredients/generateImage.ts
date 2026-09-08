import { replaceIngredientImage } from "@convex/functions/ingredients/ingredientImage";
import { internalMutation } from "@convex/procedures";
import { v } from "convex/values";

/**
 * Second step of the image generation process: persist the generated image ID to the ingredient
 * row, and delete any outdated images.
 * ⚠️ Do not call this directly; use `generateImageNode` instead, which handles the full process of
 * generating and persisting the image.
 */
export const _internal_persist = internalMutation({
  args: {
    ingredientId: v.id("ingredients"),
    imageId: v.id("images"),
  },
  handler: (ctx, args) => replaceIngredientImage(ctx, args),
})
