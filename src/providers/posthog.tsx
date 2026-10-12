import { PostHogProvider } from "posthog-react-native";

import { env } from "env";

/**
 * Product analytics for the whole app, sent to the same PostHog project the backend reports what
 * each paid call cost to. Named for what it does rather than `PostHogProvider`, the library's
 * component it wraps, so the two never differ by one capital letter at an import.
 */
export const AnalyticsProvider = ({ children }: { children: React.ReactNode }) => (
  <PostHogProvider apiKey={env.EXPO_PUBLIC_POSTHOG_KEY} options={{ host: env.EXPO_PUBLIC_POSTHOG_HOST }}>
    {children}
  </PostHogProvider>
);
