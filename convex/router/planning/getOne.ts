import { v } from "convex/values";

import { loadMealCard } from "@convex/functions/planning/loadMealCard";
import { householdQueryI18n } from "@convex/procedures";

/**
 * One plate of the kept week — the meal sheet, which opens on a plate id and nothing else.
 *
 * `householdQueryI18n`, so membership is the authorization and there is no `userId` argument. A
 * plate that is gone answers `null`; one of another household is refused — see `loadMealCard`.
 */
export const authed = householdQueryI18n({
  args: { mealId: v.id("plannedMeals") },
  handler: (ctx, args) =>
    loadMealCard(ctx, { ...args, householdId: ctx.householdId, locale: ctx.i18n.locale }),
});
