import { weekSummary } from "@convex/functions/health/weekSummary";
import { householdQueryI18n } from "@convex/procedures";

/**
 * How the household ate over its last cooking days — the card at the top of Home.
 *
 * `householdQueryI18n`, so membership is the authorization and there is no `userId` argument: the
 * plates belong to the household. No clock either: the period is anchored on the last cooked plate,
 * not on today.
 */
export const authed = householdQueryI18n({
  args: {},
  handler: (ctx) => weekSummary(ctx, { householdId: ctx.householdId, locale: ctx.i18n.locale }),
});
