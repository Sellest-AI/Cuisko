import { v } from "convex/values";

import { weekIdeas } from "@convex/functions/planning/weekIdeas";
import { householdQueryI18n } from "@convex/procedures";

/**
 * The home shelf's picks for one week, drawn from the household's constraints.
 *
 * `householdQueryI18n`, so membership is the authorization: the diet and allergens are read from
 * that household's stored preferences, never from the client. The caller's own recipes are
 * `ctx.userId`'s — no argument names another user.
 *
 * `weekKey` is the client's local Monday (`weekKeyOf`); the server derives the shuffle seed from
 * it, so the week rotates without a stored row or a cron.
 */
export const authed = householdQueryI18n({
  args: { weekKey: v.string() },
  handler: (ctx, args) =>
    weekIdeas(ctx, {
      ...args,
      householdId: ctx.householdId,
      userId: ctx.userId,
      locale: ctx.i18n.locale,
    }),
});
