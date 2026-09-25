import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

/**
 * The lot each ingredient is reserved against: the first row the household holds of it.
 *
 * @limitation **One lot per line, for V1.** A requirement large enough to draw on two lots records
 * only this one, and the remainder is bought. It is a hint rather than an authority — cooking finds
 * the row by ingredient — and it exists so that preferring what expires soonest becomes a scoring
 * change rather than a migration.
 */
export const cellarLots = async (
  ctx: Pick<QueryCtx, "db">,
  householdId: Id<"households">,
): Promise<Map<Id<"ingredients">, Id<"cellarItems">>> => {
  const cellar = await ctx.db
    .query("cellarItems")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const lots = new Map<Id<"ingredients">, Id<"cellarItems">>();

  for (const item of cellar) {
    if (item.quantity > 0 && !lots.has(item.ingredientId)) lots.set(item.ingredientId, item._id);
  }

  return lots;
};
