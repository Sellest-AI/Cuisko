import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnalyticsProvider } from "../posthog";

/**
 * The provider's contract with PostHog: the options it hands the client. The real client is not
 * started — it would send events — so the provider is faked and its options captured.
 */
const captured = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }));

vi.mock("env", () => ({
  env: { EXPO_PUBLIC_POSTHOG_KEY: "phc_test", EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" },
}));

vi.mock("posthog-react-native", () => ({
  PostHogProvider: ({ options, children }: { options: Record<string, unknown>; children: React.ReactNode }) => {
    captured.options = options;
    return children;
  },
}));

type Storage = { getItem: (key: string) => unknown; setItem: (key: string, value: string) => unknown };

describe("AnalyticsProvider", () => {
  /**
   * On web PostHog finds neither the native file system nor AsyncStorage, and without a storage of
   * its own it threw "No storage available" during the first render: a blank page.
   */
  it("gives PostHog a storage on web, which keeps what it writes", async () => {
    render(
      <AnalyticsProvider>
        <p>app</p>
      </AnalyticsProvider>,
    );

    const storage = captured.options?.customStorage as Storage | undefined;
    expect(storage).toBeDefined();

    await storage!.setItem("posthog-distinct-id", "cook-1");
    expect(await storage!.getItem("posthog-distinct-id")).toBe("cook-1");
  });
});
