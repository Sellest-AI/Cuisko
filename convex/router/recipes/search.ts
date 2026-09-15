import { v } from "convex/values";

import { searchForUser } from "@convex/functions/recipes/searchForUser";
import { authQueryI18n } from "@convex/procedures";

/**
 * Every recipe matching a term — the caller's, the seeded catalog's and other cooks' — ranked for
 * the caller: their own first, then the ones that keep their diet, names before ingredients
 * inside each. The merge and the ranking are `searchForUser`'s.
 *
 * `authQueryI18n` and not an owned builder, deliberately: a recipe is readable by any signed-in
 * cook (ADR 0014), and a search is a read. It takes no `userId`: the caller is `ctx.userId`, and
 * that is who the answer is ranked for.
 */
export const authed = authQueryI18n({
  args: { query: v.string() },
  handler: (ctx, { query }) =>
    searchForUser(ctx, { userId: ctx.userId, locale: ctx.i18n.locale, query }),
});
