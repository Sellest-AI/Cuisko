import { Password } from "@convex-dev/auth/providers/Password";
import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

import type { Id } from "./_generated/dataModel";
import { refuseClosedReviewSignIn } from "./functions/auth/reviewAccount";
import { accountEventOf } from "./functions/users/accountEvent";
import { clearDeletion } from "./functions/users/clearDeletion";
import { onUserCreated } from "./functions/users/onUserCreated";
import type { MutationCtx } from "./procedures";
import { env } from "./env";
import { resolveAuthRedirect } from "./lib/authRedirect";
import { captureEvent } from "./lib/posthog/captureEvent";

/**
 * Authentication, owned by @convex-dev/auth.
 *
 * The component owns the `users` table and rewrites it on every sign-in, so none of our fields
 * may live there. `usersExtended` is our sibling row, and `procedures.ts` merges the two into a
 * single `AppUser` before any handler runs — see docs/ARCHITECTURE.md § Identity.
 *
 * The exports here are the component's own registered functions. They sit outside the
 * `anon | authed | admin | server | _internal` grammar on purpose: that grammar governs
 * `convex/router/**`, which is our API surface. This file is a mount point for someone else's.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password,
    Apple({
      clientId: env.AUTH_APPLE_ID,
      clientSecret: env.AUTH_APPLE_SECRET,
      /**
       * Replaces the provider's own `profile`, which returns `image: null` — a value the
       * component's `users` validator rejects, so every Apple sign-in failed
       * (github.com/convex/convex-auth/issues/301). Apple sends `user` with the name on the first
       * consent only; later sign-ins carry no name, and leaving it out keeps the stored one.
       */
      profile: ({ sub, email, user }) => {
        const name = [user?.name?.firstName, user?.name?.lastName].filter(Boolean).join(" ");
        return { id: sub, email: email ?? user?.email ?? undefined, name: name || undefined };
      },
    }),
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    })
  ],

  callbacks: {
    /** Only SITE_URL and the app's `cuisko://` scheme — see `lib/authRedirect.ts`. */
    async redirect({ redirectTo }) {
      return resolveAuthRedirect(redirectTo, env.SITE_URL);
    },
    /**
     * Creates the extended row and a first household the moment an account exists, inside the same
     * mutation as the user row, which is what keeps the three in step. See `onUserCreated`.
     */
    async afterUserCreatedOrUpdated(genericCtx, { userId, existingUserId }) {
      if (existingUserId) return; // a returning user already has one

      // The component types this callback against `AnyDataModel` — it cannot know our schema —
      // so `ctx.db.query("usersExtended")` has no table types without this. The cast is narrowing
      // to the real runtime type, not asserting something unchecked: at runtime this IS our
      // MutationCtx, and the tables and indexes it touches are verified by C3/C4 against the schema.
      const ctx = genericCtx as unknown as MutationCtx;

      await onUserCreated(ctx, userId as Id<"users">);
    },
    /**
     * Signing in cancels a pending account deletion. Runs on every sign-in that creates a session,
     * whatever the provider, and never on a token refresh. See `clearDeletion`. The review account
     * is refused first while no review is open (`refuseClosedReviewSignIn`).
     *
     * Reports `account deletion cancelled` (ADR 0019) from here: this callback is sign-in's entry
     * point, the one Convex Auth calls where a client would call a router.
     */
    async beforeSessionCreation(genericCtx, { userId }) {
      // Same narrowing as `afterUserCreatedOrUpdated` above.
      const ctx = genericCtx as unknown as MutationCtx;

      await refuseClosedReviewSignIn(ctx, userId as Id<"users">);
      const cleared = await clearDeletion(ctx, userId as Id<"users">);

      const event = cleared && accountEventOf(cleared.user, "account deletion cancelled", { daysLeft: cleared.daysLeft });
      if (event) await captureEvent(ctx, event);
    },
  },
});
