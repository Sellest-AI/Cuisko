import { useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { atom, useAtom } from "jotai";

/**
 * Whether there is a cook, and whether Convex has confirmed them. Apart from `auth.ts` so the query
 * hooks can read it without loading sign-in storage, which reads the environment when it loads.
 */

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
 *
 * The race runs the other way too. When a sign-in lands its token, Convex still reports the
 * signed-out `{ isLoading: false, isAuthenticated: false }` for one render, and only starts
 * confirming the token in an effect after it. A token Convex has not confirmed is therefore
 * "authenticating", never "signed out" — or every gate bounces to its signed-out answer mid sign-in.
 *
 * `hasSession` is the other question: is there a cook on this device at all? A token is stored and
 * no sign-in or sign-out is in flight. Convex need not have confirmed it, and offline it never
 * does, so it is what decides whether to draw the device copy (`useQueryDevice`) and whether
 * to send anyone to sign in. `isAuthenticated` still decides whether the server can be asked.
 */
export const useAuthenticated = () => {
  const token = useAuthToken();
  const { isAuthenticated: isConvexAuthenticated, isLoading } = useConvexAuth();
  const [isTransitioning, setAuthenticating] = useAtom(authenticatingAtom);

  return {
    isAuthenticated: !!token && isConvexAuthenticated && !isTransitioning && !isLoading,
    isAuthenticating: isTransitioning || isLoading || (!!token && !isConvexAuthenticated),
    hasSession: !!token && !isTransitioning,
    setAuthenticating,
  };
};
