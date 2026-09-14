import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { toPlannedMealCards, type PlannedMealCard } from "./plannedMealCard";

type Args = {
  householdId: Id<"households">;
  mealId: Id<"plannedMeals">;
  locale: Locale;
};

/**
 * One plate of the kept week, as the meal sheet draws it — or `null` once it is gone.
 *
 * `null` rather than `NOT_FOUND`, which is what `loadHouseholdMeal` answers the writes with: this
 * backs a reactive read on a route the user can reopen from a stale link or hold open while the
 * plate is removed under it, and "no longer in the plan" is the answer that screen has to show,
 * not a failure. A plate of another household is still refused — the sheet edits what it reads,
 * and the boundary is the same one every planning write keeps.
 */
export const loadMealCard = async (ctx: QueryCtx, args: Args): Promise<PlannedMealCard | null> => {
  const meal = await ctx.db.get(args.mealId);

  if (!meal) return null;
  if (meal.householdId !== args.householdId) throw new ConvexError({ code: "FORBIDDEN" });

  const [card] = await toPlannedMealCards(ctx, { householdId: args.householdId, meals: [meal], locale: args.locale });

  return card ?? null;
};
