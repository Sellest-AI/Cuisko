import { setFavorite } from "@convex/functions/recipes/setFavorite";
import { authMutation } from "@convex/procedures";
import { v } from "convex/values";

/**
 * Sets whether a recipe sits on the caller's shelf.
 *
 * `authMutation`, not `ownedMutation`: the recipe being favorited is, more often than not, somebody
 * else's — that is what a shelf is for (ADR 0014). The only owner here is the favorite row itself,
 * and it is keyed on `ctx.userId`, so there is no argument through which a caller could touch
 * another cook's shelf.
 *
 * `liked` is the state wanted, not a toggle — `functions/recipes/setFavorite` says why.
 */
export const authed = authMutation({
  args: { id: v.id("recipes"), liked: v.boolean() },
  handler: (ctx, { id, liked }) => setFavorite(ctx, { userId: ctx.userId, recipeId: id, liked }),
});
