import { ConvexError } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import { compareVersions } from "../../lib/compareVersions";
import type { QueryCtx } from "../../procedures";

/**
 * The shared account a store reviewer signs in with.
 *
 * In code, not in env or the database, because `getReviewAccount` hands it to any build the window
 * is open for, so there is no secret to keep from the people it is shown to. What this costs: it is
 * in git. Signing in with it is refused while the window is closed (`refuseClosedReviewSignIn`), but
 * a session opened during a review outlives it. It is an ordinary user with no privileges, and
 * anything it can reach is what any new account can reach.
 *
 * ⚠️ Never edit the password once the account exists on a deployment. The account is created on the
 * first long press with whatever is here (through the signIn-then-signUp fallback in
 * `src/lib/convex/auth.ts`; if that fallback goes, so does this story), and changing this later
 * leaves the stored account on the old password: the sign-in fails and the reviewer sees an error with no reason. To change it, delete
 * the user on that deployment first.
 */
export const REVIEW_ACCOUNT = {
  email: "review@cuisko.app",
  password: "6Vohcz_oTFvOCH6rrpyVtcyr",
} as const;

export type ReviewAccount = { email: string; password: string };

/** The part of `appConfig` the window reads. `reviewVersion` is the build submitted to a store. */
export type ReviewConfig = { liveVersion: string; reviewVersion?: string };

/**
 * The shared review account's credentials, if this caller is allowed to see them right now.
 *
 * A build in review is, by definition, newer than the one in the stores. So the window is open
 * only while `reviewVersion` is ahead of `liveVersion`, and only to a build that is at least the
 * one in review. Releasing means setting `liveVersion` to it, which shuts the window with no
 * second step to forget.
 *
 * `callerVersion` is whatever the client says it is, so this is a speed bump rather than a lock:
 * what keeps the account safe is that the window is closed in steady state and that the account
 * is an ordinary user. A version that does not parse closes the window — never the reverse.
 */
export const reviewWindow = (config: ReviewConfig | null, callerVersion: string): ReviewAccount | null => {
  if (!config?.reviewVersion) return null;
  if (compareVersions(config.reviewVersion, config.liveVersion) !== 1) return null;
  const caller = compareVersions(callerVersion, config.reviewVersion);
  if (caller === null || caller < 0) return null;

  return { ...REVIEW_ACCOUNT };
};

/** What `router/auth/getReviewAccount` answers: the credentials while the window is open to this build. */
export const getReviewAccount = async (ctx: QueryCtx, appVersion: string) => {
  const config = await ctx.db.query("appConfig").withIndex("by_creation_time").first();
  return reviewWindow(config, appVersion);
};

/**
 * Refuses a sign-in as the review account while no review is open, so the credentials in git open
 * nothing between reviews. Called from `beforeSessionCreation` in `convex/auth.ts`.
 *
 * The caller's version is not known at sign-in, so this asks only whether the window is open at all:
 * it is open to someone exactly when it is open to the build in review. Any other account costs one
 * read.
 */
export const refuseClosedReviewSignIn = async (ctx: Pick<QueryCtx, "db">, userId: Id<"users">) => {
  const user = await ctx.db.get(userId);
  if (user?.email !== REVIEW_ACCOUNT.email) return;

  const config = await ctx.db.query("appConfig").withIndex("by_creation_time").first();
  if (!reviewWindow(config, config?.reviewVersion ?? "")) throw new ConvexError({ code: "REVIEW_WINDOW_CLOSED" });
};
