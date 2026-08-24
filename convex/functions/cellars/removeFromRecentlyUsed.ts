import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type Args = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
}

/**
 * Forgets that a household ever ran out of an ingredient.
 *
 * Recently-used holds what is on neither the shelf nor the list, so putting the ingredient
 * back in either place is what clears it. Silent when there is nothing to clear: every caller
 * reaches here on a path where the row may or may not exist.
 */
export const removeFromRecentlyUsed = async (ctx: MutationCtx, args: Args) => {
  const existingRecentlyUsed = await ctx.db.query("recentlyUsedIngredients")
    .withIndex("by_household_id_and_ingredient_id", q => q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .first();

  if (existingRecentlyUsed) await ctx.db.delete(existingRecentlyUsed._id);
}
