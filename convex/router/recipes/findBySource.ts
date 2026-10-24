import { v } from "convex/values";

import { findBySource } from "@convex/functions/recipes/findBySource";
import { internalQuery } from "@convex/procedures";

/**
 * A live recipe imported from `sourceUrl`, anyone's, and who imported it; or `null`.
 *
 * Its own file because two actions ask it: `importVideo` (a reel already imported) and
 * `findWebRecipe` (a page the chat found is already a recipe).
 * Actions cannot read the database, so each crosses here rather than holding a twin of it.
 */
export const _internal = internalQuery({
  args: { sourceUrl: v.string() },
  returns: v.union(v.object({ recipeId: v.id("recipes"), userId: v.optional(v.id("users")) }), v.null()),
  handler: (ctx, args) => findBySource(ctx, args),
});
