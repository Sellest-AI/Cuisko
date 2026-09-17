import { v } from "convex/values";

import { planDraft } from "@convex/functions/planning/planDraft";
import { vMealSlots } from "@convex/schema/households";
import { vCookingTime } from "@convex/schema/planningPayloads";
import { vAllergens, vDiet } from "@convex/schema/preferences";
import { householdQueryI18n } from "@convex/procedures";

/**
 * A generated week for the caller's household, written nowhere.
 *
 * `householdQueryI18n`, so membership is the authorization: the draft is scored against that
 * household's cellar and reservations. The caller's own recipes are `ctx.userId`'s — there is no
 * `userId` argument, so no shape of this call draws on somebody else's private recipes.
 *
 * The seed, the days and the run's constraints are the client's on purpose — see `planDraft`.
 */
export const authed = householdQueryI18n({
  args: {
    seed: v.number(),
    servings: v.number(),
    dates: v.array(v.number()),
    slots: vMealSlots,
    today: v.number(),
    diet: vDiet,
    avoids: vAllergens,
    cookingTime: v.optional(vCookingTime),
  },
  handler: (ctx, args) =>
    planDraft(ctx, {
      ...args,
      householdId: ctx.householdId,
      userId: ctx.userId,
      locale: ctx.i18n.locale,
    }),
});
