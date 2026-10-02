import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type DeleteCtx = Pick<MutationCtx, "db">;

/**
 * Everything @convex-dev/auth keeps that lets a person sign in as `userId`: their accounts (one per
 * provider, with any pending verification codes), their sessions (with their refresh tokens), and the
 * failed-attempt counters it keys by email.
 *
 * Without it a purged account could still sign in: the session would be refused by `loadUser`, but the
 * address would stay registered to a tombstone, and the same person signing up again would land on
 * it instead of on a fresh account. With it, the email is free.
 *
 * @limitation Design choice: `authVerifiers` is not reached. Its only index is on the signature, so
 * the rows tied to a session cannot be found without a scan, and they are short-lived PKCE verifiers
 * that name nobody.
 *
 * The component owns these tables, and its indexes are named after their fields, not `by_…`.
 */
export const deleteSignIns = async (
  ctx: DeleteCtx,
  userId: Id<"users">,
  email: string | undefined,
): Promise<void> => {
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();

  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);

    await ctx.db.delete(account._id);
  }

  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();

  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);

    await ctx.db.delete(session._id);
  }

  if (!email) return;

  const attempts = await ctx.db
    .query("authRateLimits")
    .withIndex("identifier", (q) => q.eq("identifier", email))
    .collect();
  for (const attempt of attempts) await ctx.db.delete(attempt._id);
};
