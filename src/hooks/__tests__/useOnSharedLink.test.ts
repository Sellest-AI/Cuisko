import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { useOnSharedLink } from "../useOnSharedLink";

/**
 * The native module is replaced by a share this file sets, and `resetShareIntent` clears it as the
 * real one does, so a re-render after the link was handed over sees no share left.
 */
const state = vi.hoisted(() => ({
  share: null as { webUrl: string | null; text: string | null } | null,
  resets: 0,
}));

vi.mock("expo-share-intent", () => ({
  useShareIntent: () => ({
    hasShareIntent: state.share !== null,
    shareIntent: state.share ?? { webUrl: null, text: null },
    resetShareIntent: () => {
      state.resets += 1;
      state.share = null;
    },
  }),
}));

const REEL = "https://www.instagram.com/reel/DcTtz3Ftj9I/";

beforeEach(() => {
  state.share = null;
  state.resets = 0;
});

describe("useOnSharedLink", () => {
  it("hands over the shared link once, however often the caller re-renders", () => {
    state.share = { webUrl: REEL, text: null };
    const onLink = vi.fn();

    const { rerender } = renderHook(() => useOnSharedLink((link) => onLink(link), { enabled: true }));
    rerender();

    expect(onLink.mock.calls).toEqual([[REEL]]);
    expect(state.resets).toBe(1);
  });

  it("holds a share while disabled, then hands it over once enabled", () => {
    state.share = { webUrl: REEL, text: null };
    const onLink = vi.fn();

    const { rerender } = renderHook(({ enabled }) => useOnSharedLink(onLink, { enabled }), {
      initialProps: { enabled: false },
    });
    expect(onLink).not.toHaveBeenCalled();
    expect(state.resets).toBe(0);

    rerender({ enabled: true });

    expect(onLink).toHaveBeenCalledWith(REEL);
  });

  it("clears a share with no link in it without handing anything over", () => {
    state.share = { webUrl: null, text: "poulet au curry" };
    const onLink = vi.fn();

    renderHook(() => useOnSharedLink(onLink, { enabled: true }));

    expect(onLink).not.toHaveBeenCalled();
    expect(state.resets).toBe(1);
  });
});
