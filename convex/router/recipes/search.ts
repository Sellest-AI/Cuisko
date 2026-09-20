import { v } from "convex/values";

import { searchForUser } from "@convex/functions/recipes/searchForUser";
import { authQueryI18n, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";

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

/**
 * The same search, for the assistant's `searchRecipes` tool.
 *
 * Internal because of where it is called from, not because it does anything `authed` does not. The
 * tool runs inside a scheduled action, which carries no identity — so there is no `ctx.userId` to
 * rank against and the caller has to name one. A client that could reach this would be a client
 * that could ask for another cook's ranking, which is why nothing but the scheduler can.
 *
 * `limit` is the tool's to choose and small: a model reads these and a shopper is shown them, and
 * neither wants twenty-four. `searchForUser`'s own default is for a grid.
 */
export const _internal = internalQuery({
  args: { query: v.string(), userId: v.id("users"), locale: vLocale, limit: v.number() },
  handler: (ctx, args) => searchForUser(ctx, args),
});
