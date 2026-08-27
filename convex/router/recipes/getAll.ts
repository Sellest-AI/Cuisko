import { paginationOptsValidator } from "convex/server";

import { listForUser } from "@convex/functions/recipes/listForUser";
import { authQueryI18n } from "@convex/procedures";

/**
 * The caller's own recipes, a page at a time.
 *
 * There is no `admin` twin and no `userId` argument. The owner is `ctx.userId` and nothing else,
 * so there is no shape of this call that reads somebody else's list — the authorization is the
 * absence of the parameter, not a check that could be forgotten.
 */
export const authed = authQueryI18n({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) =>
    listForUser(ctx, { userId: ctx.userId, locale: ctx.i18n.locale, paginationOpts }),
});
