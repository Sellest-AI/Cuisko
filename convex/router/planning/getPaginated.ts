import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { pageMeals } from "@convex/functions/planning/pageMeals";
import { householdQueryI18n } from "@convex/procedures";

/**
 * The household's plates a page at a time, forward or back from a day — the planning list.
 *
 * `householdQueryI18n`, so membership is the authorization. See `pageMeals` for why there are two
 * directions rather than one cursor.
 */
export const authed = householdQueryI18n({
  args: {
    from: v.number(),
    direction: v.union(v.literal("before"), v.literal("after")),
    paginationOpts: paginationOptsValidator,
  },
  handler: (ctx, args) =>
    pageMeals(ctx, { ...args, householdId: ctx.householdId, locale: ctx.i18n.locale }),
});
