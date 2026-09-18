import { platesOnList } from "@convex/functions/cellars/platesOnList";
import { householdQueryI18n } from "@convex/procedures";

/**
 * The plates still claiming a row on the household's grocery list — what the "by plan" view of
 * the list groups under.
 *
 * `householdQueryI18n`, so membership is the authorization, and the recipe titles come back in
 * the caller's language.
 */
export const authed = householdQueryI18n({
  args: {},
  handler: (ctx) => platesOnList(ctx, { householdId: ctx.householdId, locale: ctx.i18n.locale }),
});
