import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenTracking } from "../screen-tracking";

/** The route's segments as expo-router reports them; a test navigates by writing here. */
const route = vi.hoisted(() => ({ segments: [] as string[] }));
/** One client for every render, as `usePostHog` returns one. */
const client = vi.hoisted(() => ({ screen: vi.fn(() => Promise.resolve()) }));
const { screen } = client;

/** Who is signed in; screens are recorded only for a cook. */
const auth = vi.hoisted(() => ({ userId: "camille" as string | null, isDeciding: false }));

vi.mock("expo-router", () => ({ useSegments: () => route.segments }));
vi.mock("~/modules/auth/hooks", () => ({ useSignedInUserId: () => auth }));
vi.mock("posthog-react-native", () => ({ usePostHog: () => client }));

describe("ScreenTracking", () => {
  beforeEach(() => {
    screen.mockClear();
    route.segments = [];
    auth.userId = "camille";
  });

  it("names home `/`", () => {
    render(<ScreenTracking />);

    expect(screen).toHaveBeenCalledWith("/");
  });

  /** Two recipes are one screen: an id in the name would make every recipe its own. */
  it("names a recipe by its route pattern, not by its id", () => {
    route.segments = ["recipe", "[id]", "step-by-step"];
    render(<ScreenTracking />);

    expect(screen).toHaveBeenCalledWith("/recipe/[id]/step-by-step");
  });

  it("keeps the group in the name, so a sheet stays told apart from a page", () => {
    route.segments = ["(modals)", "preferences"];
    render(<ScreenTracking />);

    expect(screen).toHaveBeenCalledWith("/(modals)/preferences");
  });

  /** A signed-out launch sits on home under the gate's cover before it is sent to `/auth`. */
  it("records nothing while nobody is signed in, then the screen the cook lands on", () => {
    auth.userId = null;
    const view = render(<ScreenTracking />);
    route.segments = ["auth"];
    view.rerender(<ScreenTracking />);

    expect(screen).not.toHaveBeenCalled();

    auth.userId = "camille";
    route.segments = ["onboarding", "promise"];
    view.rerender(<ScreenTracking />);

    expect(screen.mock.calls).toEqual([["/onboarding/promise"]]);
  });

  it("records a screen once per navigation, not once per render", () => {
    route.segments = ["recipes"];
    const view = render(<ScreenTracking />);
    view.rerender(<ScreenTracking />);
    route.segments = ["groceries"];
    view.rerender(<ScreenTracking />);

    expect(screen.mock.calls).toEqual([["/recipes"], ["/groceries"]]);
  });
});
