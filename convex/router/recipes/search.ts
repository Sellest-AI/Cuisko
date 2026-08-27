import { v } from "convex/values";

import { searchForUser } from "@convex/functions/recipes/searchForUser";
import { authQueryI18n } from "@convex/procedures";

/**
 * The caller's own recipes, narrowed by a term — matched against the recipe's name and against the
 * ingredients in it, with names ranked first. The merge and the ranking are `searchForUser`'s.
 *
 * Like `getAll`, it takes no `userId`: the owner is `ctx.userId`, so no argument exists that could
 * search somebody else's recipes.
 */
export const authed = authQueryI18n({
  args: { query: v.string() },
  handler: (ctx, { query }) =>
    searchForUser(ctx, { userId: ctx.userId, locale: ctx.i18n.locale, query }),
});
