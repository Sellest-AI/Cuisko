import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

/**
 * The lot each ingredient is reserved against: the held row that goes off soonest, undated rows
 * last, and the oldest row among equals.
 *
 * That is `consumeFromCellar`'s drain order once the plan's own lot is set aside, so the lot a meal
 * reserves is the one cooking would have reached first anyway. Reserving the first row instead
 * pinned a meal to a fresh carton while an older one went off beside it.
 *
 * @limitation **One lot per line, for V1.** A requirement large enough to draw on two lots records
 * only this one, and the remainder is bought. It is a hint rather than an authority — cooking finds
 * the row by ingredient.
 */
export const cellarLots = async (
  ctx: Pick<QueryCtx, "db">,
  householdId: Id<"households">,
): Promise<Map<Id<"ingredients">, Id<"cellarItems">>> => {
  // `by_household` returns rows oldest first, so keeping the first of two equal dates keeps the
  // older row.
  const cellar = await ctx.db
    .query("cellarItems")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const soonest = new Map<Id<"ingredients">, Doc<"cellarItems">>();

  for (const item of cellar) {
    if (item.quantity <= 0) continue;

    const held = soonest.get(item.ingredientId);
    if (!held || (item.expirationDate ?? Infinity) < (held.expirationDate ?? Infinity)) {
      soonest.set(item.ingredientId, item);
    }
  }

  return new Map([...soonest].map(([ingredientId, item]) => [ingredientId, item._id]));
};
