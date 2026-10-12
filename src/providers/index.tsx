import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ConvexReactClient } from "convex/react";
import { SafeAreaProvider } from "@ui/safe-area-view";
import { AnimationProvider } from "./animation";
import { FontsProvider } from "./fonts";

import { convexAuthStorage } from "~/lib/convex/storage";
import { env } from "env";
import { AnalyticsProvider } from "./posthog";

/**
 * One client for the whole app. Created at module scope, not in a component: a client recreated
 * on re-render drops every active subscription and reconnects.
 */
const convex = new ConvexReactClient(env.EXPO_PUBLIC_CONVEX_URL, {
  // React Native has no window to regain focus, so this Web-oriented default only costs
  // reconnects on mobile.
  unsavedChangesWarning: false,
});

/**
 * `ConvexQueryCacheProvider` is what makes `useQueryCached` more than an alias — it holds query
 * results across unmounts, so tab switches and back-navigation do not re-fetch and flash a
 * spinner at content the user was just looking at. It must sit inside the auth provider, since
 * cached subscriptions belong to an authenticated client.
 *
 * `FontsProvider` is outermost, and that is the point of it: it renders nothing until the type
 * face is registered, so no descendant can paint a heading in the system font and reflow. Above
 * the Convex providers rather than below, because a query subscription opened during the font
 * gate would be thrown away when the gate lifts. And above `AuthGate`, which the root layout
 * renders inside `Providers`: the gate owns the splash, and cannot hide it before it mounts.
 */
export const Providers = ({ children }: { children: React.ReactNode }) => (
  <FontsProvider>
    <ConvexAuthProvider client={convex} storage={convexAuthStorage}>
      <AnalyticsProvider>
        <ConvexQueryCacheProvider>
          <KeyboardProvider>
            <AnimationProvider>
              <SafeAreaProvider>
                <GestureHandlerRootView>
                  {children}
                </GestureHandlerRootView>
              </SafeAreaProvider>
            </AnimationProvider>
          </KeyboardProvider>
        </ConvexQueryCacheProvider>
      </AnalyticsProvider>
    </ConvexAuthProvider>
  </FontsProvider>
);
