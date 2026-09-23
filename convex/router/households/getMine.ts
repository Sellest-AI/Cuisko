import { listForUser } from "@convex/functions/households/listForUser";
import { authQuery } from "@convex/procedures";

/**
 * The caller's households, with their members' faces and which one the app shops for. Takes no
 * argument: the only identity it could be asked about is the one it already holds, and accepting a
 * `userId` here would be the impersonation hole `authQuery` exists to close.
 *
 * Every household-scoped query takes a `householdId`, so this resolves before any of them can be
 * issued — one waterfall per session, held by `useQueryCached`.
 */
export const authed = authQuery({
  args: {},
  handler: (ctx) => listForUser(ctx, ctx.user),
});
