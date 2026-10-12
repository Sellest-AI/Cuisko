import { router, useNavigationContainerRef, usePathname, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "theme";

import { useAuth } from "./_hooks/useAuth";
import { AUTH } from "./constants";

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
 * Reset to by the group's name, so its layout's `initialRouteName` picks the first step. The href
 * names that step outright, because the group has no index route for `/onboarding` to land on.
 */
const ONBOARDING = { name: "onboarding", href: "/onboarding/promise" } as const;

type Destination = typeof AUTH | typeof ONBOARDING;

/**
 * Sends each person to the side of the app they belong on, and holds the splash until it has.
 *
 * Signed out, every route but `/auth` redirects there; signed in, `/auth` redirects to the
 * onboarding, which ends on home by itself. A cold start with a live session never passes through
 * `/auth`, so it opens wherever it opens, home included. Nothing
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
 *
 * @limitation Every sign-in walks the onboarding, not only an account's first. **Accepted because**
 * nothing records that it was seen, and adding that was kept out of this slice on purpose. **Until
 * fixed**, a returning cook walks it again after a reinstall or a sign-out, to the end.
 * **The fix** is an optional `onboardedAt` on `usersExtended`, exposed by `getMe`, with existing
 * rows backfilled so current users are not sent through it.
 */
export const AuthGate = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const navigation = useNavigationContainerRef();

  const isOnAuth = pathname === AUTH.href;
  const destination: Destination | null =
    isLoading ? null
    : !isAuthenticated && !isOnAuth ? AUTH
    : isAuthenticated && isOnAuth ? ONBOARDING
    : null;
  const isSettled = !isLoading && destination === null;

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
   */
  useEffect(() => {
    if (!destination) return;
    if (navigation.isReady()) navigation.reset({ index: 0, routes: [{ name: destination.name }] });
    else router.replace(destination.href satisfies Href);
  }, [destination, navigation]);

  return isSettled || isOnAuth ? null : <Cover />;
};

const Cover = () => <View style={[StyleSheet.absoluteFill, styles.cover]} />;

const styles = StyleSheet.create({
  cover: { backgroundColor: theme.colors.background },
});
