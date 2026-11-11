import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TracedMutationCtx } from "@convex/procedures";

import { refreshRecipe } from "./refreshRecipe";

/**
 * Recipe lines read per run. Half the 100 recipes `migrations.refreshRecipes` already refreshes in
 * one mutation, because each refresh here reads that recipe's lines and rows too.
 *
 * @limitation Design choice: the value is reasoned, not measured on this path. If a run nears the
 * mutation read limit, the page shrinks.
 */
export const REFRESH_PAGE = 50;

/**
 * One page of the recipes that use a catalog row, refreshed, then the next page scheduled.
 *
 * Run after the row's weights or nutrients changed: the ham's new slice weight changes the
 * nutrition tags of every croque-monsieur, not only the recipe whose save caused the repair. It
 * pages because a seed row can be in hundreds of recipes.
 *
 * A recipe can be refreshed twice — it has two lines on the row across two pages, or a refresh
 * rewrote its lines — and the second refresh writes nothing (`refreshRecipe`).
 */
export const refreshRecipesUsing = async (
  ctx: TracedMutationCtx,
  { ingredientId, cursor }: { ingredientId: Id<"ingredients">; cursor: string | null },
): Promise<void> => {
  const lines = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_ingredient", (q) => q.eq("ingredientId", ingredientId))
    .paginate({ cursor, numItems: REFRESH_PAGE });

  // One at a time, as `replaceInRecipes` does: each refresh reads and writes its own recipe.
  // `skipArchived` also steps over a line whose recipe is gone (`refreshRecipe`).
  for (const recipeId of new Set(lines.page.map((line) => line.recipeId)))
    await refreshRecipe(ctx, recipeId, { skipArchived: true });

  if (!lines.isDone)
    await ctx.scheduleTracedAfter(0, internal.router.recipes.refreshUsing._internal, {
      ingredientId,
      cursor: lines.continueCursor,
    });
};
