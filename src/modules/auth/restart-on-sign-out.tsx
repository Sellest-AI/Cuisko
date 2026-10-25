import { reloadAppAsync } from "expo";
import { usePostHog } from "posthog-react-native";
import { useLayoutEffect, useRef, useState } from "react";

import { useSignedInUserId } from "./_hooks/useSignedInUserId";
import { Cover } from "./cover";

/** How long the cook who left waits for analytics to send before the app restarts anyway. */
const FLUSH_BUDGET_MS = 2_000;

/**
 * Restarts the app when the signed-in cook is signed out, so nothing they left in memory serves the
 * next one: the conversation with Cuisko, imports in flight, a staged photo, cached query results.
 * Only the `householdAtom`s reset on their own (ADR 0016), and only when the next household differs.
 * A restart empties every atom and module cache at once, including the ones added later, where a
 * per-atom reset would have to be kept in step with each of them.
 *
 * It follows the session rather than the sign-out button, because a session also ends without it: a
 * refresh token that expired or was revoked, an account whose deletion went through. Mounted once,
 * at the root, for the same reason `AnalyticsTracking` is.
 *
 * Only a settled sign-out counts. While auth is deciding (a token being refreshed, a sign-out still
 * in flight) nothing happens, and a launch that starts signed out never restarts, since it has no
 * one to forget.
 *
 * Analytics is flushed first: its queue is in memory and written to a file in the background, so
 * the events the cook just sent would go with the restart. The flush gets `FLUSH_BUDGET_MS` and no
 * more; offline, PostHog retries for seconds, and analytics never holds the app (`AnalyticsTracking`).
 *
 * The app is covered while it waits. The sign-in screen is already up underneath, and a sign-in
 * started there would be torn down by the restart, its provider sheet with it. Mounted after
 * `AuthGate`, so the cover draws over the gate's own; a layout effect, so `/auth` is never painted
 * uncovered in between. A restart that fails takes the cover down again: the sign-in screen, with
 * the last cook's state still in memory, is what the app was before this, and a blank page is worse.
 */
export const RestartOnSignOut = () => {
  const posthog = usePostHog();
  const { userId, isDeciding } = useSignedInUserId();
  const wasSignedIn = useRef(false);
  const [isRestarting, setIsRestarting] = useState(false);

  useLayoutEffect(() => {
    if (isDeciding) return;
    if (userId !== null) {
      wasSignedIn.current = true;
      return;
    }
    if (!wasSignedIn.current) return;
    wasSignedIn.current = false;
    setIsRestarting(true);

    const budget = new Promise<void>((resolve) => setTimeout(resolve, FLUSH_BUDGET_MS));
    Promise.race([posthog.flush(), budget])
      .catch((cause: unknown) => {
        if (__DEV__) console.warn("[RestartOnSignOut] could not flush analytics", cause);
      })
      .then(() => reloadAppAsync("signed out"))
      .catch((cause: unknown) => {
        console.error("[RestartOnSignOut] could not restart the app", cause);
        setIsRestarting(false);
      });
  }, [isDeciding, posthog, userId]);

  return isRestarting ? <Cover /> : null;
};
