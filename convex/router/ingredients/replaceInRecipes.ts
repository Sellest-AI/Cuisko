import { v } from "convex/values";

import { replaceInRecipes } from "@convex/functions/ingredients/replaceInRecipes";
import { internalMutation } from "@convex/procedures";

/**
 * Moves the named recipe lines from one catalog row to another, refreshes the recipes they belong
 * to, and deletes `from` once nothing points at it. See `functions/ingredients/replaceInRecipes`.
 *
 * Internal: it rewrites shared recipes and the shared catalog, and it is run by hand from the
 * dashboard (`npx convex run router/ingredients/replaceInRecipes:_internal`). No cook may call it.
 */
export const _internal = internalMutation({
  args: {
    from: v.id("ingredients"),
    to: v.id("ingredients"),
    lineIds: v.array(v.id("recipeIngredients")),
  },
  returns: v.object({
    linesMoved: v.number(),
    recipesRefreshed: v.number(),
    recipesSkipped: v.array(v.id("recipes")),
    deleted: v.boolean(),
    keptBecause: v.array(v.string()),
  }),
  handler: (ctx, args) => replaceInRecipes(ctx, args),
});
