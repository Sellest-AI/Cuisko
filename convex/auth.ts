import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

import type { MutationCtx } from "./procedures";
import { env } from "./env";
import { resolveAuthRedirect } from "./lib/authRedirect";

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
     * Creates the extended row the moment an account exists.
     *
     * `loadUser` returns null when a user has no `usersExtended` row, and every authenticated
     * procedure treats null as unauthenticated — so without this callback a freshly registered
     * user would sign in successfully and then be rejected by every query. Creating it here,
     * inside the same mutation as the user row, is what keeps the two in step.
     */
    async afterUserCreatedOrUpdated(genericCtx, { userId, existingUserId }) {
      if (existingUserId) return; // a returning user already has one

      // The component types this callback against `AnyDataModel` — it cannot know our schema —
      // so `ctx.db.query("usersExtended")` has no table types without this. The cast is narrowing
      // to the real runtime type, not asserting something unchecked: at runtime this IS our
      // MutationCtx, and the table and index below are verified by C3/C4 against the schema.
      const ctx = genericCtx as unknown as MutationCtx;

      const existing = await ctx.db
        .query("usersExtended")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();

      if (existing) return; // defensive: the callback is not guaranteed to run exactly once

      await ctx.db.insert("usersExtended", {
        userId,
        role: "USER",
        updatedAt: Date.now(),
      });
    },
  },
});
