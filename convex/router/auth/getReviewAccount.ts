import { getReviewAccount } from "@convex/functions/auth/reviewAccount";
import { publicQuery } from "@convex/procedures";
import { v } from "convex/values";

/**
 * The shared review account, while a store reviewer can be holding the build that needs it.
 *
 * `anon` by necessity: it runs before anyone is signed in. Its protection is that it has nothing to
 * hand out unless the `appConfig` row exists and `appVersion` falls inside the review window
 * (`functions/auth/reviewAccount.ts`). The version is the caller's own claim, so this
 * is a speed bump and not a lock; the account is an ordinary user, and the window is shut once the
 * build is released.
 */
export const anon = publicQuery({
  args: { appVersion: v.string() },
  handler: (ctx, { appVersion }) => getReviewAccount(ctx, appVersion),
});
