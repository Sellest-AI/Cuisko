import { listFavorites } from "@convex/functions/recipes/listFavorites";
import { authQueryI18n } from "@convex/procedures";

/**
 * The caller's shelf: the recipes they favorited, newest favorite first.
 *
 * No `admin` twin and no `userId` argument, for the same reason `getAll` has neither: the owner is
 * `ctx.userId` and nothing else, so there is no shape of this call that reads somebody else's
 * favorites — which is what keeps the shelf a private curation rather than a feed.
 */
export const authed = authQueryI18n({
  args: {},
  handler: (ctx) => listFavorites(ctx, { userId: ctx.userId, locale: ctx.i18n.locale }),
});
