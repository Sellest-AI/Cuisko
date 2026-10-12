import { useSegments } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useEffect, useRef } from "react";

import { useSignedInUserId } from "./_hooks/useSignedInUserId";
import { identityStep } from "./_model/analytics-identity";
import { AUTH } from "./constants";

/**
 * Tells analytics who is signed in, then which screen they are on, in that order.
 *
 * **Who.** The cook's `users` id, the id the backend records each paid call under, so their screens
 * and what they cost join on one person. Nothing else about them: no name, no email (the privacy
 * policy promises as much). The step is decided by `identityStep` against what analytics holds,
 * once it has loaded that from storage.
 *
 * **Where.** A screen view per route change, named by the route's pattern, never its path:
 * `/recipe/[id]` for every recipe, where the path would make each recipe a screen of its own. Groups
 * stay in (`/(modals)/…`), so a sheet and a page remain told apart. Nothing is sent while nobody is
 * signed in: a signed-out launch sits on home under the auth gate's cover. Nor is the gate's own
 * sign-in screen (`AUTH`): it is the route when a sign-in finishes, but the cook saw it signed out.
 *
 * **One effect, so the order holds.** Sent separately, the first screen after a sign-in raced the
 * identify and landed on the anonymous visitor. Here the screen goes out only after the identity
 * step, and only when it differs from the last one sent, so a re-render or an auth flicker never
 * sends it twice.
 *
 * Mounted once, at the root, rather than inside `useAuth`, which several screens call at once. The
 * provider's own screen capture is off (`AnalyticsProvider`). A failure is logged and dropped:
 * analytics is an add-on, and must never break signing in or navigating.
 */
export const AnalyticsTracking = () => {
  const posthog = usePostHog();
  const { userId, isDeciding } = useSignedInUserId();
  const screen = `/${useSegments().join("/")}`;
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (isDeciding) return;
    let isCurrent = true;

    posthog
      .ready()
      .then(() => {
        if (!isCurrent) return;
        const step = identityStep({
          userId,
          distinctId: posthog.getDistinctId(),
          anonymousId: posthog.getAnonymousId(),
        });
        if (step === "reset" || step === "reset-and-identify") posthog.reset();
        if (userId === null) {
          lastSent.current = null;
          return;
        }
        if (step === "identify" || step === "reset-and-identify") posthog.identify(userId);

        if (screen === AUTH.href || screen === lastSent.current) return;
        lastSent.current = screen;
        return posthog.screen(screen);
      })
      .catch((cause: unknown) => console.error(`[AnalyticsTracking] could not update analytics on ${screen}`, cause));

    return () => {
      isCurrent = false;
    };
  }, [isDeciding, posthog, screen, userId]);

  return null;
};
