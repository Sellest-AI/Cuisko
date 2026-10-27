import { useCallback, useState } from "react";

import { APP_VERSION } from "~/lib/appVersion";
import { api } from "~/lib/convex/api";
import {
  useAuthActions,
  useAuthenticated,
  type Credentials,
  type OAuthProvider,
} from "~/lib/convex/auth";
import { useQueryCached, useQueryDevice } from "~/lib/convex/client";
import { useTranslations } from "translations";

export type { Credentials, OAuthProvider } from "~/lib/convex/auth";

/** The name a person reads on the button — not a translation, a brand. */
const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

/**
 * Everything a screen needs to sign in and know who it is talking to.
 *
 * This folder holds the only references to `api.router.users.*` for this domain — a screen calls
 * `useAuth()` and never touches `api`, `useQueryCached`, or the auth SDK (ADR 0006). When the
 * backend changes, this folder is the one that changes.
 */
export const useAuth = () => {
  const t = useTranslations("Auth");
  const { isAuthenticated, isAuthenticating, hasSession } = useAuthenticated();
  const { signIn: runSignIn, signInWithProvider: runProvider, signOut, isSubmitting } =
    useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);

  /**
   * `'skip'` is Convex's idiom for "not yet": the hook call stays unconditional while the query
   * stays unsent. Gated on a stored session rather than a confirmed one: the device copy draws the
   * cook before Convex answers, and with no signal at all; the live query still waits for
   * confirmation inside `useQueryDevice`.
   */
  const { data: user, isPending } = useQueryDevice(api.router.users.getMe.authed, hasSession ? {} : "skip");

  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      setError(null);
      setPendingProvider(provider);
      try {
        await runProvider(provider);
      } catch (cause) {
        setError(t("error_provider_x_name", { name: PROVIDER_NAMES[provider] }));
        if (__DEV__) console.warn(`[useAuth] ${provider} sign-in failed`, cause);
      } finally {
        setPendingProvider(null);
      }
    },
    [runProvider, t],
  );

  /**
   * Email and password — a permanent development harness: signing in without a browser round-trip
   * keeps test accounts and simulators usable. The screen renders it under `__DEV__` only,
   * so the English below never reaches a person using the app.
   */
  const signIn = useCallback(
    async (credentials: Credentials) => {
      setError(null);
      try {
        await runSignIn(credentials);
      } catch (cause) {
        // The server deliberately does not say whether the email or the password was wrong —
        // that distinction is an account-enumeration oracle. So neither do we.
        setError(
          "Could not connect. Check the password, and use at least 8 characters for a new account.",
        );
        if (__DEV__) console.warn("[useAuth] sign-in failed", cause);
      }
    },
    [runSignIn],
  );

  /**
   * The shared account a store reviewer signs in with. The backend answers `null` unless this
   * build is the one in review (`reviewWindow`), so availability is the server's call and never
   * compared here. Skipped once signed in: nobody needs the credentials then, and they should not
   * linger in the query cache.
   */
  const { data: reviewAccount } = useQueryCached(
    api.router.auth.getReviewAccount.anon,
    isAuthenticated ? "skip" : { appVersion: APP_VERSION },
  );

  const signInAsReviewer = useCallback(async () => {
    if (!reviewAccount) return;
    setError(null);
    try {
      await runSignIn(reviewAccount);
    } catch (cause) {
      setError(t("error_review_account"));
      if (__DEV__) console.warn("[useAuth] review sign-in failed", cause);
    }
  }, [reviewAccount, runSignIn, t]);

  return {
    user,
    isAuthenticated,
    isAuthenticating,
    hasSession,
    isReviewAvailable: !!reviewAccount,
    signInAsReviewer,
    // A signed-in user is still "loading" until their row arrives, or the screen flashes an
    // empty id between authenticating and having data. A sign-in the user just started is not:
    // its button carries the spinner, and swapping the whole screen for a loader would hide it.
    // Nor is a stored session whose row is on the device: Convex confirming it, or never reaching
    // the server offline, changes nothing on screen. `isPending` stays false while the device copy
    // is served, so the confirmation never turns this back on.
    isLoading:
      (isAuthenticating && !isSubmitting && !(hasSession && user)) || (isAuthenticated && isPending),
    isSubmitting,
    pendingProvider,
    error,
    signIn,
    signInWithProvider,
    signOut,
  };
};
