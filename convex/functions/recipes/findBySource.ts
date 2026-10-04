import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

/**
 * A live recipe imported from `sourceUrl`, whoever imported it, and who that was; or `null`.
 *
 * What makes a share of a video someone already imported free: `importVideo` answers with that
 * recipe instead of paying for the model again, and the cook's app favorites it when it is not
 * theirs, so it lands on their shelf (ADR 0014: any signed-in cook may read and favorite it).
 * Live rows only, so a video whose imports were all deleted is imported afresh.
 *
 * `sourceUrl` is already canonical: the caller's adapter built it (`lib/socialVideo/`), as
 * `saveRecipe` stores it. When several cooks hold a copy (imports from before this lookup was
 * global), the oldest one answers.
 */
export const findBySource = async (
  ctx: QueryCtx,
  { sourceUrl }: { sourceUrl: string },
): Promise<{ recipeId: Id<"recipes">; userId?: Id<"users"> } | null> => {
  const recipe = await ctx.db
    .query("recipes")
    .withIndex("by_is_archived_and_source_url", (q) => q.eq("isArchived", false).eq("sourceUrl", sourceUrl))
    .first();

  return recipe ? { recipeId: recipe._id, userId: recipe.userId } : null;
};
