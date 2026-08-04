import { useAuthActions as useConvexAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { atom, useAtom } from "jotai";
import { useCallback, useState } from "react";

import { convexAuthStorage } from "./storage";

/** The Password provider's two entry points. Same form, different intent. */
export type AuthFlow = "signIn" | "signUp";

export type Credentials = { email: string; password: string; flow: AuthFlow };

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

  const signIn = useCallback(
    async ({ email, password, flow }: Credentials) => {
      setIsSubmitting(true);
      setAuthenticating(true);
      try {
        await convex.signIn("password", { email, password, flow });
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

  return { isSubmitting, signIn, signOut };
};

export { useAuthToken, useConvexAuth };
