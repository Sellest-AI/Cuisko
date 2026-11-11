import { refreshRecipesUsing } from "@convex/functions/recipes/refreshRecipesUsing";
import { internalMutation } from "@convex/procedures";
import { v } from "convex/values";

/**
 * Refreshes the recipes using a catalog row, one page per run — see `refreshRecipesUsing`.
 * Internal: scheduled by `patchIngredient` after it wrote a fact, and by itself for the next page.
 */
export const _internal = internalMutation({
  args: { ingredientId: v.id("ingredients"), cursor: v.union(v.string(), v.null()) },
  handler: (ctx, args): Promise<void> => refreshRecipesUsing(ctx, args),
});
