import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

/**
 * The day of the household's latest plate, or `null` when it has never kept one.
 *
 * A local-day timestamp, the client's own, exactly as `commitPlan` stored it: the server never
 * counts days (see `mealsBetween`'s daylight-saving hour), so it says *which* day is the latest and
 * the client counts on from there. Every plate counts — cooked or not, behind the household or
 * ahead of it. A latest day already lived resolves to tomorrow on the client, and the function
 * stays one read on the index.
 */
export const lastPlannedDate = async (
  ctx: Pick<QueryCtx, "db">,
  householdId: Id<"households">,
): Promise<number | null> => {
  const latest = await ctx.db
    .query("plannedMeals")
    .withIndex("by_household_and_date", (q) => q.eq("householdId", householdId))
    .order("desc")
    .first();

  return latest?.date ?? null;
};
