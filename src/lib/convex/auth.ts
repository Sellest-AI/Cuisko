import { useAuthActions as useConvexAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { atom, useAtom } from "jotai";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

import { convexAuthStorage } from "./storage";

export type Credentials = { email: string; password: string };

/** The OAuth providers the auth screen offers. Ids match the provider ids in `convex/auth.ts`. */
export type OAuthProvider = "google" | "apple";

/**
 * True only while a sign-in or sign-out is mid-flight.
 *
 * Module-scoped rather than component state because the transition outlives any one component:
 * `signOut` unmounts the screen that started it.
 */
const authenticatingAtom = atom(false);

/**
 * Whether the app is really authenticated — the question every gate should ask.
 *
 * All four conditions matter. `useConvexAuth` alone flips to `true` before the token is readable,
 * and a screen that trusts it fires its first query a beat too early and gets rejected. Requiring
 * the token as well, and excluding both transition states, is what makes this a single reliable
 * boolean instead of a race the UI has to paper over.
 */
export const useAuthenticated = () => {
  const token = useAuthToken();
  const { isAuthenticated: isConvexAuthenticated, isLoading } = useConvexAuth();
  const [isTransitioning, setAuthenticating] = useAtom(authenticatingAtom);

  return {
    isAuthenticated: !!token && isConvexAuthenticated && !isTransitioning && !isLoading,
    isAuthenticating: isTransitioning || isLoading,
    setAuthenticating,
  };
};

/**
 * Sign-in and sign-out, vendor-side only. No domain queries live here — a module's `_hooks/`
 * owns those (ADR 0006), which is why this file never imports `api`.
 */
export const useAuthActions = () => {
  const convex = useConvexAuthActions();
  const { setAuthenticating } = useAuthenticated();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Connects with a password, whether or not the account exists yet.
   *
   * The Password provider cannot do this alone: its `signIn` flow rejects an unknown email and its
   * `signUp` flow rejects a known one. So `signIn` goes first and `signUp` is the fallback. The
   * server's errors are opaque on purpose (no enumeration oracle), so the fallback runs on any
   * `signIn` failure; for a known email with a wrong password, `signUp` then fails too, and
   * that second error is the one the caller sees.
   */
  const signIn = useCallback(
    async ({ email, password }: Credentials) => {
      setIsSubmitting(true);
      setAuthenticating(true);
      try {
        try {
          await convex.signIn("password", { email, password, flow: "signIn" });
        } catch {
          await convex.signIn("password", { email, password, flow: "signUp" });
        }
      } finally {
        setIsSubmitting(false);
        setAuthenticating(false);
      }
    },
    [convex, setAuthenticating],
  );

  /**
   * One path for sign-in and sign-up alike: an OAuth provider creates the account on first use,
   * and `afterUserCreatedOrUpdated` in `convex/auth.ts` gives it its extended row either way.
   *
   * On web, `signIn` navigates the window to the provider itself and the page never comes back
   * here. On native it resolves with a `redirect` URL instead, which has to be opened in an auth
   * session; Convex sends the browser back to `cuisko://?code=…`, and that code is handed to a
   * second `signIn` to finish.
   *
   * Closing the sheet resolves quietly — changing your mind is not an error. A return without a
   * `code` throws, because that is the provider refusing (consent declined), and the caller's
   * error line should say so.
   */
  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      setIsSubmitting(true);
      setAuthenticating(true);
      try {
        const redirectTo = Linking.createURL("/");
        const { redirect } = await convex.signIn(provider, { redirectTo });
        if (Platform.OS === "web" || !redirect) return;

        const session = await WebBrowser.openAuthSessionAsync(redirect.toString(), redirectTo);
        if (session.type !== "success") return;

        const code = new URL(session.url).searchParams.get("code");
        if (!code) throw new Error(`${provider} sign-in returned without a code`);

        await convex.signIn(provider, { code });
      } finally {
        setIsSubmitting(false);
        setAuthenticating(false);
      }
    },
    [convex, setAuthenticating],
  );

  /**
   * Clearing storage after `signOut()` is not belt-and-braces — @convex-dev/auth leaves the
   * refresh token behind, and a stale refresh token silently restores the session on next launch.
   */
  const signOut = useCallback(async () => {
    setAuthenticating(true);
    try {
      await convex.signOut();
      await convexAuthStorage.clear();
    } finally {
      setAuthenticating(false);
    }
  }, [convex, setAuthenticating]);

  return { isSubmitting, signIn, signInWithProvider, signOut };
};

export { useAuthToken, useConvexAuth };
