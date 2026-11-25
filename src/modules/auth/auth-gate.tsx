import { router, useNavigationContainerRef, usePathname, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { clearDeviceCache } from "~/lib/convex/deviceCache";
import { isOnboardingSeen, markOnboardingSeen } from "~/modules/onboarding/seen";
import { recipeScreenAt } from "~/modules/recipes/routes";

import { useAuth } from "./_hooks/useAuth";
import { useTakeReturnPath } from "./_hooks/useTakeReturnPath";
import { isAuthFlowPath, isGuestPath } from "./_model/auth-flow";
import { AUTH } from "./constants";
import { Cover } from "./cover";

/**
 * At module scope, not in an effect: the splash hides itself on the first frame unless told
 * otherwise before that frame, and an effect runs after it.
 *
 * This gate is the splash's only owner. `FontsProvider` also has to be waited for, and is, by
 * position rather than by a call: it sits above this gate and renders nothing until the H4 face is
 * registered, so the gate's one `hide()` cannot run before the font is in.
 */
SplashScreen.preventAutoHideAsync().catch((cause) => {
  if (__DEV__) console.warn("[AuthGate] could not hold the splash screen", cause);
});

/**
 * Android fades the splash out over 400 ms by default, on an ease-in curve: its first half barely
 * moves, so it reads as more launch time rather than a transition. iOS cuts with no fade at all
 * (`fade` defaults to false there), which this leaves as is.
 */
SplashScreen.setOptions({ duration: 200 });

/**
 * Reset to by the group's name, so its layout's `initialRouteName` picks the first step. The href
 * names that step outright, because the group has no index route for `/onboarding` to land on.
 */
const ONBOARDING = { name: "onboarding", href: "/onboarding/promise" } as const;

/** Home, under whatever a sign-in ends on: Cuisko's chat, or the recipe that asked for the sign-in. */
const HOME = { name: "index", href: "/" } as const;

type Destination = typeof AUTH | typeof ONBOARDING | typeof HOME;

/**
 * Sends each person to the side of the app they belong on, and holds the splash until it has.
 *
 * With no session, every route redirects to the onboarding, or to `/auth` on a device that is done
 * with it (`isOnboardingSeen`), except those two and a recipe a shared link opened (`isGuestPath`);
 * signed in, those two redirect home, with Cuisko's chat or the recipe that asked for the sign-in
 * over it. A recipe the cook went back to while their sign-in was in flight stays up: it is the page
 * they would be returned to. "No session" is no stored token,
 * not "Convex has not confirmed it": a stored session whose cook is on the device draws at once,
 * offline included, and a refresh failing on a weak network leaves the screen where it is. A session
 * the server refuses clears the token, and lands here as no session. A cold start with a live session
 * never passes through `/auth`, so it opens wherever it opens, home included. Nothing
 * is decided while auth is settling or a signed-in person's row is still arriving: the first
 * screen drawn is the right one, rather than home flashing before a bounce to `/auth`, or a header
 * drawn anonymous before its avatar lands.
 *
 * The splash hides once, on the first settled frame. After that, the same waits (a sign-in
 * resolving into its row, a sign-out clearing the session) are covered by a plain page instead,
 * so the screen being left is never seen answering for an account that is no longer there.
 * Except on `/auth`: it answers for no account, and it draws its own loaders — a sign-in's button
 * spinner, then its page spinner — which a cover would only blank out and hand back.
 *
 * Mounted beside the navigator rather than around it: it navigates, so the navigator must exist.
 */
export const AuthGate = () => {
  const { isAuthenticated, isAuthenticating, hasSession, isLoading } = useAuth();
  const pathname = usePathname();
  const navigation = useNavigationContainerRef();
  const takeReturnPath = useTakeReturnPath();

  const isOnAuth = pathname === AUTH.href;
  const isInAuthFlow = isAuthFlowPath(pathname);
  const isSignedOut = !hasSession && !isAuthenticating;

  const destination: Destination | null =
    isLoading ? null
      : isSignedOut && !isInAuthFlow && !isGuestPath(pathname) ? (isOnboardingSeen() ? AUTH : ONBOARDING)
        : isAuthenticated && isInAuthFlow ? HOME
          : null;
  const isSettled = !isLoading && destination === null;

  /** Two cooks can share a phone: a session that ends leaves nothing of the last one on disk. */
  useEffect(() => {
    if (isSignedOut) clearDeviceCache();
  }, [isSignedOut]);

  /** Whoever is signed in has no use for it, the cooks from before the flag existed included. */
  useEffect(() => {
    if (hasSession) markOnboardingSeen();
  }, [hasSession]);

  useEffect(() => {
    if (isSettled) SplashScreen.hide();
  }, [isSettled]);

  /**
   * A reset, not a redirect: crossing the auth line leaves nothing behind it, so a swipe back after
   * signing in cannot land on `/auth`, and one after signing out cannot land in the app. `dismissAll`
   * is not enough — it pops the innermost stack only, and the root keeps everything below it.
   *
   * The container is not ready on the very first frame of a cold start, where the history is one
   * screen anyway; `router.replace` waits for it, and replacing that one screen is the same reset.
   *
   * A sign-in ends with a screen over home: home sits *under* it, so closing it shows home, and one
   * reset draws both, where a push after it showed home in between.
   */
  useEffect(() => {
    if (!destination) return;
    if (!navigation.isReady()) {
      router.replace(destination.href satisfies Href);
      return;
    }
    if (destination !== HOME) {
      navigation.reset({ index: 0, routes: [{ name: destination.name }] });
      return;
    }

    const returnPath = takeReturnPath();
    const recipe = returnPath ? recipeScreenAt(returnPath) : undefined;

    navigation.reset({
      index: 1,
      routes: [{ name: HOME.name }, recipe ?? { name: "(modals)", params: { screen: "assistant" } }],
    });
  }, [destination, navigation, takeReturnPath]);

  /** A sign-in that landed on a page of the app ends there: a page still held would open at the next one. */
  useEffect(() => {
    if (isAuthenticated && isSettled) takeReturnPath();
  }, [isAuthenticated, isSettled, takeReturnPath]);

  return isSettled || isOnAuth ? null : <Cover />;
};
