import { PostHogProvider } from "posthog-react-native";

import { env } from "env";

/**
 * Product analytics for the whole app, sent to the same PostHog project the backend reports what
 * each paid call cost to. Named for what it does rather than `PostHogProvider`, the library's
 * component it wraps, so the two never differ by one capital letter at an import.
 *
 * Of the library's autocapture, only app lifecycle events stay on (installed, updated, opened,
 * backgrounded). Its screen capture is off because it reads React Navigation's container, which
 * expo-router does not expose: `AnalyticsTracking` sends screens instead, along with who the cook is.
 * Touches stay off, as they are by default.
 */
export const AnalyticsProvider = ({ children }: { children: React.ReactNode }) => (
  <PostHogProvider
    apiKey={env.EXPO_PUBLIC_POSTHOG_KEY}
    options={{ host: env.EXPO_PUBLIC_POSTHOG_HOST }}
    autocapture={{ captureScreens: false }}
  >
    {children}
  </PostHogProvider>
);
