import { v } from "convex/values";

import { replaceIngredientImage } from "@convex/functions/ingredients/ingredientImage";
import { persistRestoredIngredient } from "@convex/functions/ingredients/persistRestoredIngredient";
import { type RestoredIngredient, restoreIngredient } from "@convex/functions/ingredients/restoreIngredient";
import { internalAction, internalMutation } from "@convex/procedures";
import { vPortableIngredient, vRestoredIngredientImage } from "@convex/schema/ingredientPayloads";

/**
 * One ingredient from an `ingredients:export` zip into this deployment, for the
 * `ingredients:restore` script through a deploy key.
 *
 * An action because the image is uploaded (`media/images/uploadMany._internal`), after the row is
 * written by `_internal_persist`. Internal because it writes the shared catalog, which no cook may
 * do directly.
 */
export const _internal = internalAction({
  args: { ingredient: vPortableIngredient, image: vRestoredIngredientImage },
  returns: v.object({
    ingredientId: v.id("ingredients"),
    outcome: v.union(v.literal("created"), v.literal("imageAdded"), v.literal("existing")),
  }),
  handler: (ctx, args): Promise<RestoredIngredient> => restoreIngredient(ctx, args),
});

/** The row, written or matched before anything is uploaded, and whether it still wants an image. */
export const _internal_persist = internalMutation({
  args: { ingredient: vPortableIngredient },
  returns: v.object({ ingredientId: v.id("ingredients"), created: v.boolean(), needsImage: v.boolean() }),
  handler: (ctx, args) => persistRestoredIngredient(ctx, args),
});

/** The uploaded cut-out onto the row, as `generateImage._internal_persist` attaches a generated one. */
export const _internal_attachImage = internalMutation({
  args: { ingredientId: v.id("ingredients"), imageId: v.id("images") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await replaceIngredientImage(ctx, args);

    return null;
  },
});
