import { useAuthActions as useConvexAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

import { clearDeviceCache } from "./deviceCache";
import { useAuthenticated } from "./session";
import { convexAuthStorage } from "./storage";

export type Credentials = { email: string; password: string };

/** The OAuth providers the auth screen offers. Ids match the provider ids in `convex/auth.ts`. */
export type OAuthProvider = "google" | "apple";

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
   * The device copy of the cook's data goes with it, before `RestartOnSignOut` reloads the app.
   */
  const signOut = useCallback(async () => {
    setAuthenticating(true);
    try {
      await convex.signOut();
      await convexAuthStorage.clear();
      clearDeviceCache();
    } finally {
      setAuthenticating(false);
    }
  }, [convex, setAuthenticating]);

  return { isSubmitting, signIn, signInWithProvider, signOut };
};

export { useAuthenticated, useAuthToken, useConvexAuth };
