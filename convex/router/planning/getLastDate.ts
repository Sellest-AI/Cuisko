import { lastPlannedDate } from "@convex/functions/planning/lastPlannedDate";
import { householdQuery } from "@convex/procedures";

/**
 * The day of the household's latest kept plate, or `null` — where the next week starts after.
 *
 * `householdQuery`, so membership is the authorization and there is no `userId` argument: a plan
 * belongs to the household. The day arithmetic stays on the client, which counts from this answer
 * with the same `planDates` it counts from today with — see `lastPlannedDate`.
 */
export const authed = householdQuery({
  args: {},
  handler: (ctx) => lastPlannedDate(ctx, ctx.householdId),
});
