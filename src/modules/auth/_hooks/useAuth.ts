import { useCallback, useState } from "react";

import { api } from "~/lib/convex/api";
import { useAuthActions, useAuthenticated, type Credentials } from "~/lib/convex/auth";
import { useQueryCached } from "~/lib/convex/client";

export type { AuthFlow } from "~/lib/convex/auth";

/**
 * Everything a screen needs to sign in and know who it is talking to.
 *
 * This is the only file that references `api.router.users.*` for this domain — a screen calls
 * `useAuth()` and never touches `api`, `useQueryCached`, or the auth SDK (ADR 0006). When the
 * backend changes, this file is the one that changes.
 */
export const useAuth = () => {
  const { isAuthenticated, isAuthenticating } = useAuthenticated();
  const { signIn: runSignIn, signOut, isSubmitting } = useAuthActions();
  const [error, setError] = useState<string | null>(null);

  /**
   * `'skip'` is Convex's idiom for "not yet": the hook call stays unconditional while the query
   * stays unsent. Without it every signed-out render fires a query guaranteed to be rejected.
   */
  const { data: user, isPending } = useQueryCached(
    api.router.users.getMe.authed,
    isAuthenticated ? {} : "skip",
  );

  const signIn = useCallback(
    async (credentials: Credentials) => {
      setError(null);
      try {
        await runSignIn(credentials);
      } catch (cause) {
        // The server deliberately does not say whether the email or the password was wrong —
        // that distinction is an account-enumeration oracle. So neither do we.
        setError(
          credentials.flow === "signUp"
            ? "Could not create that account. The email may already be registered, or the password is too short."
            : "Could not sign in. Check the email and password.",
        );
        if (__DEV__) console.warn("[useAuth] sign-in failed", cause);
      }
    },
    [runSignIn],
  );

  return {
    user,
    isAuthenticated,
    // A signed-in user is still "loading" until their row arrives, or the screen flashes an
    // empty id between authenticating and having data.
    isLoading: isAuthenticating || (isAuthenticated && isPending),
    isSubmitting,
    error,
    signIn,
    signOut,
  };
};
