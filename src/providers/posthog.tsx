import { PostHogProvider } from "posthog-react-native";
import { Platform } from "react-native";

import { env } from "env";

/**
 * The browser's own storage, on web; `undefined` everywhere else, where PostHog finds its own.
 *
 * PostHog looks for the native file system or AsyncStorage, and on web there is neither: without a
 * storage of its own it threw "No storage available" on the first render, and the page stayed blank.
 * `localStorage` keeps the cook's anonymous id across reloads, as the file does on a phone.
 *
 * None during the web build's server render, where there is no `window`. PostHog falls back to
 * memory there by itself.
 */
const webStorage = () =>
  Platform.OS === "web" && typeof window !== "undefined"
    ? {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    }
    : undefined;

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
    options={{ host: env.EXPO_PUBLIC_POSTHOG_HOST, customStorage: webStorage() }}
    autocapture={{ captureScreens: false }}
  >
    {children}
  </PostHogProvider>
);
