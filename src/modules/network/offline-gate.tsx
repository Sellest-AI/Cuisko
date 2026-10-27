import { useGlobalSearchParams, useNavigationContainerRef, usePathname, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { useAuth } from "~/modules/auth/hooks";

import { useConnection } from "./_hooks/useConnection";
import { useWatchConnection } from "./_hooks/useWatchConnection";
import { toFromParam } from "./_model/blockedRoute";
import { OFFLINE_ROUTES } from "./constants";

/** The navigation tree, as much of it as this reads. */
type Tree = { routes: readonly { key?: string; state?: Tree }[] };

/** Every route key in the tree, nested navigators included (`(modals)` holds its own stack). */
const _keysOf = (state: Tree | undefined, keys = new Set<string>()): Set<string> => {
  for (const route of state?.routes ?? []) {
    if (route.key) keys.add(route.key);
    _keysOf(route.state, keys);
  }
  return keys;
};

/**
 * The one place that decides which route may open with no signal. It sends a route opened offline
 * to `/offline`, and leaves alone a route already up when the signal drops: it blocks arriving,
 * never staying. A half-typed recipe, the step being cooked, a planning run stay on screen; their
 * own saves and loads wait for the signal.
 *
 * Arriving is a focused route whose key was not in the tree the last time the socket was up, so
 * going back to a route that stayed mounted is staying, and a route opened during the grace is
 * arriving once the grace runs out. A socket that has never connected (a cold start offline, a deep
 * link included) has nothing to stay on: every route outside `OFFLINE_ROUTES` is arriving.
 *
 * Acts only once the navigator is ready and `AuthGate` has settled on a session, so it never races
 * that gate's reset to `/auth`.
 *
 * A reset of the root stack rather than a push: sheets, the account drawer and the cooking screen
 * are root routes presented natively, so the reset closes them too, and nothing has to draw over a
 * native presentation. Back, or the page's own button, lands on Home.
 *
 * Mounted beside the navigator rather than around it: it navigates, so the navigator must exist.
 * Mounted for the life of the app, it is also what measures the connection for every screen.
 */
export const OfflineGate = () => {
  useWatchConnection();
  const navigation = useNavigationContainerRef();
  const { isLoading, hasSession } = useAuth();
  const { isOffline, isConnected, hasEverConnected } = useConnection();
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams();

  /** The template and the params, as the offline page will hand them back to the router. */
  const from = toFromParam({
    pathname: `/${segments.join("/")}`,
    params: Object.fromEntries(
      Object.entries(params).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined),
    ),
  });

  /** The keys as of the last render with the socket up: what "already there" is measured against. */
  const knownKeys = useRef<Set<string> | undefined>(undefined);

  useEffect(() => {
    if (!navigation.isReady()) return;
    if (isConnected) knownKeys.current = _keysOf(navigation.getRootState());

    if (!isOffline || isLoading || !hasSession || OFFLINE_ROUTES.includes(pathname)) return;

    // The root ref is untyped (`never` params): the route is read for its key alone.
    const focused = (navigation.getCurrentRoute() as { key?: string } | undefined)?.key;
    const isArriving = !hasEverConnected || !focused || !knownKeys.current?.has(focused);
    if (!isArriving) return;

    navigation.reset({ index: 1, routes: [{ name: "index" }, { name: "offline", params: { from } }] });
  }, [navigation, pathname, isOffline, isConnected, isLoading, hasSession, hasEverConnected, from]);

  return null;
};
