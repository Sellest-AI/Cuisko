import { router, usePathname } from "expo-router";
import { useSetAtom } from "jotai";
import { useCallback } from "react";

import { useAuthenticated } from "~/lib/convex/auth";

import { AUTH, HOME } from "../constants";
import { returnPathAtom } from "./atoms";

/**
 * For a control that needs an account, on a page that does not: it stays visible, and asks for the
 * sign-in when tapped. The action itself is not replayed after it.
 *
 * `isSignedOut` is the rule `AuthGate` decides on. While auth is still deciding there is neither a
 * session nor a signed-out person, so a tap then does nothing rather than guess.
 */
export const useRequireSignIn = () => {
  const { hasSession, isAuthenticating } = useAuthenticated();
  const pathname = usePathname();
  const holdReturnPath = useSetAtom(returnPathAtom);
  const isSignedOut = !hasSession && !isAuthenticating;

  /**
   * Holds the page on screen, then opens `/auth` over it. `navigate` and not `push`, so a double tap
   * opens one. The page stays mounted under `/auth` and `usePathname` is the focused page, so the
   * second tap of that double would hold `/auth` itself without the check.
   *
   * Every page but home is held, so the sign-in ends where it was asked (`AuthGate`). Home clears
   * what was held instead: the sign-in lands there anyway, and a recipe left earlier would
   * otherwise reopen after a sign-in asked from home.
   */
  const signIn = useCallback(() => {
    if (pathname !== AUTH.href) holdReturnPath(pathname === HOME.href ? undefined : pathname);
    router.navigate(AUTH.href);
  }, [holdReturnPath, pathname]);

  /** The action with a session, the sign-in without one. */
  const requireSignIn = useCallback(
    <Args extends unknown[]>(action: (...args: Args) => void) =>
      (...args: Args) => {
        if (hasSession) action(...args);
        else if (isSignedOut) signIn();
      },
    [hasSession, isSignedOut, signIn],
  );

  /**
   * `hasSession` for a control that covers itself rather than wrapping each action: covered without
   * one, and the cover asks for the sign-in only once `isSignedOut`, inert while auth decides.
   */
  return { hasSession, isSignedOut, signIn, requireSignIn };
};
