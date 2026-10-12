import { useSegments } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";

import { useSignedInUserId } from "~/modules/auth/hooks";

/**
 * Sends analytics a screen view each time the route changes, once a cook is signed in.
 *
 * Named by the route's pattern, never its path: `/recipe/[id]` for every recipe, where the path
 * would put each recipe's id in the name and make every recipe a screen of its own. Groups stay in
 * (`/(modals)/…`), so a sheet and a page reached by the same name remain told apart.
 *
 * **Nothing is sent while nobody is signed in.** A signed-out launch starts on home, under the
 * auth gate's cover, before the gate sends it to `/auth`: tracked, every such launch would count a
 * home view nobody saw. The first screen after signing in is sent as soon as the cook is known.
 *
 * Mounted once, at the root. The provider's own screen capture is off (`AnalyticsProvider`): it
 * reads React Navigation's container, which expo-router does not expose.
 */
export const ScreenTracking = () => {
  const posthog = usePostHog();
  const { userId } = useSignedInUserId();
  const isSignedIn = userId !== null;
  const screen = `/${useSegments().join("/")}`;

  useEffect(() => {
    if (!isSignedIn) return;

    posthog
      .screen(screen)
      .catch((cause: unknown) => console.error(`[ScreenTracking] could not record ${screen}`, cause));
  }, [isSignedIn, posthog, screen]);

  return null;
};
