import { v } from "convex/values";

import { mealsBetween } from "@convex/functions/planning/mealsBetween";
import { householdQueryI18n, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";

const args = {
  from: v.number(),
  to: v.number(),
};

/**
 * The household's plates between two days — home's week strip.
 *
 * `householdQueryI18n`, so membership is the authorization and there is no `userId` argument: a
 * plan belongs to the household. The span is capped in `mealsBetween`.
 */
export const authed = householdQueryI18n({
  args,
  handler: (ctx, a) =>
    mealsBetween(ctx, { ...a, householdId: ctx.householdId, locale: ctx.i18n.locale }),
});

/**
 * The same plates, for Cuisko: before it plans a plate it looks at what already holds that slot, as
 * the recipe screen's grid does, so it can ask before replacing it. Its turn has no signed-in cook,
 * so the household and the locale arrive as the ones `sendMessage` checked.
 */
export const _internal = internalQuery({
  args: { ...args, householdId: v.id("households"), locale: vLocale },
  handler: mealsBetween,
});
