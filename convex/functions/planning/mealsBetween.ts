import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { ConvexError } from "convex/values";

import { MAX_DAYS } from "./limits";
import { type PlannedMealCard, toPlannedMealCards } from "./plannedMealCard";

type Args = {
  householdId: Id<"households">;
  /** Local-day timestamp, inclusive. */
  from: number;
  /** Local-day timestamp, exclusive. */
  to: number;
  locale: Locale;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The widest range this read collects: a week, plus the hour a daylight-saving change adds to a
 * span measured between two local midnights.
 */
const MAX_SPAN = MAX_DAYS * DAY + HOUR;

/**
 * The household's plates between two days, in date order.
 *
 * A bounded range read rather than a page: the caller asks about a fixed window — home's week
 * strip — and a page would have to be fetched until the window happened to be covered. `.collect()`
 * is safe only because the span is capped, so the cap is enforced here and not trusted to the caller.
 */
export const mealsBetween = async (
  ctx: Pick<QueryCtx, "db">,
  { householdId, from, to, locale }: Args,
): Promise<PlannedMealCard[]> => {
  if (to <= from || to - from > MAX_SPAN)
    throw new ConvexError({ code: "INVALID_INPUT", message: `Invalid range: ${from} → ${to}` });

  const meals = await ctx.db
    .query("plannedMeals")
    .withIndex("by_household_and_date", (q) =>
      q.eq("householdId", householdId).gte("date", from).lt("date", to))
    .collect();

  return toPlannedMealCards(ctx, { householdId, meals, locale });
};
