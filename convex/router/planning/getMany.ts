import { v } from "convex/values";

import { mealsBetween } from "@convex/functions/planning/mealsBetween";
import { householdQueryI18n } from "@convex/procedures";

/**
 * The household's plates between two days — home's week strip.
 *
 * `householdQueryI18n`, so membership is the authorization and there is no `userId` argument: a
 * plan belongs to the household. The span is capped in `mealsBetween`.
 */
export const authed = householdQueryI18n({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: (ctx, args) =>
    mealsBetween(ctx, { ...args, householdId: ctx.householdId, locale: ctx.i18n.locale }),
});
