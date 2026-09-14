import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

import type { ScalableLine } from "./scaleLines";

/** One `recipeIngredients` row, with the catalog facts its scaling needs joined on. */
export type ResolvedLine = { line: ScalableLine; ingredient: Doc<"ingredients"> };

/**
 * A recipe's lines, each joined on the catalog row behind it.
 *
 * A line whose ingredient is gone can neither be scaled nor shopped for, so it is dropped rather
 * than failing the whole plan: the rest of the dish is still the dish the user agreed to cook.
 */
export const recipeLines = async (
  ctx: Pick<QueryCtx, "db">,
  recipeId: Id<"recipes">,
): Promise<ResolvedLine[]> => {
  const rows = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const resolved = await Promise.all(
    rows.map(async (row): Promise<ResolvedLine | null> => {
      const ingredient = await ctx.db.get(row.ingredientId);

      if (!ingredient) return null;

      return {
        line: { ingredientId: row.ingredientId, quantity: row.quantity, unit: row.unit, ingredient },
        ingredient,
      };
    }),
  );

  return resolved.filter((row): row is ResolvedLine => row !== null);
};
