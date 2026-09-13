import type { PaginationOptions, PaginationResult } from "convex/server";

import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { type PlannedMealCard, toPlannedMealCards } from "./plannedMealCard";

export type PageDirection = "before" | "after";

type Args = {
  householdId: Id<"households">;
  /** Local-day timestamp the list opens on. `after` includes it, `before` does not. */
  from: number;
  direction: PageDirection;
  locale: Locale;
  paginationOpts: PaginationOptions;
};

/**
 * One page of the household's plates, walking away from a day in one direction.
 *
 * Two directions because a Convex cursor cannot be started at a value: it resumes a read, it does
 * not seek. So the day goes into the index range instead, and the list runs two of these that meet
 * at it — `after` walking forward through what is planned, `before` walking back through what was
 * cooked. `before` is newest first, so the caller reverses it to lay it above.
 *
 * Plates, not `mealPlans`: the list draws plates, a plan can hold one or fourteen of them, and a
 * plan's creation order stops being date order the day `planOne` puts a single plate next Tuesday.
 */
export const pageMeals = async (
  ctx: Pick<QueryCtx, "db">,
  { householdId, from, direction, locale, paginationOpts }: Args,
): Promise<PaginationResult<PlannedMealCard>> => {
  const page = await ctx.db.query("plannedMeals")
    .withIndex("by_household_and_date", (q) =>
      direction === "after"
        ? q.eq("householdId", householdId).gte("date", from)
        : q.eq("householdId", householdId).lt("date", from))
    .order(direction === "after" ? "asc" : "desc")
    .paginate(paginationOpts);

  return { ...page, page: await toPlannedMealCards(ctx, { householdId, meals: page.page, locale }) };
};
