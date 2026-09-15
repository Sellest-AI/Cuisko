import { v } from "convex/values";

import { draftMeal } from "@convex/functions/planning/draftMeal";
import { vMealSlot } from "@convex/schema/households";
import { householdQueryI18n } from "@convex/procedures";

/**
 * One recipe as a draft plate, written nowhere — what the meal sheet swaps into the tunnel's week.
 *
 * `householdQueryI18n`, so membership is the authorization: the plate is weighed against that
 * household's cellar and reservations. The recipe may be anyone's (ADR 0014). The day, the slot
 * and the portions are the client's, like the rest of the draft — see `draftMeal`.
 */
export const authed = householdQueryI18n({
  args: {
    recipeId: v.id("recipes"),
    date: v.number(),
    slot: vMealSlot,
    servings: v.number(),
    today: v.number(),
  },
  handler: (ctx, args) =>
    draftMeal(ctx, { ...args, householdId: ctx.householdId, locale: ctx.i18n.locale }),
});
