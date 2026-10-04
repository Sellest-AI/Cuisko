import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { useImportSharedLink } from "../useImportSharedLink";

/**
 * The promise this file pins: one reel, one import at a time. A cook who shares the same reel again
 * while the first import is still running gets a second sheet that waits on that import, not a
 * second model call and a second recipe.
 *
 * Convex is mocked at `~/lib/convex/client`, and every call is left hanging so a test can open a
 * second sheet during the first import and then settle it. Both sheets share one Jotai store, as
 * two sheets in the app do.
 */
const state = vi.hoisted(() => ({
  calls: [] as { url: string }[],
  settles: [] as { resolve: (imported: Imported) => void; reject: (reason: unknown) => void }[],
  replaced: [] as unknown[],
  favorited: [] as { id: string; liked: boolean }[],
}));

vi.mock("expo-router", () => ({
  router: { replace: (href: unknown) => state.replaced.push(href) },
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({
    action: (args: { url: string }) => {
      state.calls.push(args);

      return new Promise<Imported>((resolve, reject) => {
        state.settles.push({ resolve, reject });
      });
    },
  }),
  useMutation: () => ({
    mutate: (args: { id: string; liked: boolean }) => {
      state.favorited.push(args);
      return Promise.resolve(null);
    },
    isLoading: false,
  }),
}));

type Imported = { recipeId: string; isOwned: boolean };

/** What the server answers: a recipe this share created, or one another cook already imported. */
const MINE: Imported = { recipeId: "recipe-1", isOwned: true };
const THEIRS: Imported = { recipeId: "recipe-1", isOwned: false };

const REEL = "https://www.instagram.com/reel/DcTtz3Ftj9I/?igsh=MWZ0eGx5bGRzZ3Z5aQ==";
const SAME_REEL_RESHARED = "https://www.instagram.com/reel/DcTtz3Ftj9I/?igsh=Yjk4bTF2eTRxa2Zm";
const OTHER_REEL = "https://www.instagram.com/reel/DeCpypAD0FG/";

let store: ReturnType<typeof createStore>;
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

const openSheet = (url: string) => renderHook(() => useImportSharedLink(url), { wrapper });

beforeEach(() => {
  store = createStore();
  state.calls = [];
  state.settles = [];
  state.replaced = [];
  state.favorited = [];
});

describe("useImportSharedLink", () => {
  it("imports a reel shared again during its import once, and opens the recipe in both sheets", async () => {
    openSheet(REEL);
    openSheet(SAME_REEL_RESHARED);

    expect(state.calls).toHaveLength(1);

    await act(async () => state.settles[0]!.resolve(MINE));

    expect(state.replaced).toHaveLength(2);
    expect(state.replaced[0]).toEqual(state.replaced[1]);
    expect(state.replaced[0]).toMatchObject({ params: { id: "recipe-1" } });
  });

  it("imports two different reels separately", () => {
    openSheet(REEL);
    openSheet(OTHER_REEL);

    expect(state.calls.map(({ url }) => url)).toEqual([REEL, OTHER_REEL]);
  });

  it("starts afresh once the first import has landed", async () => {
    openSheet(REEL);
    await act(async () => state.settles[0]!.resolve(MINE));

    openSheet(SAME_REEL_RESHARED);

    expect(state.calls).toHaveLength(2);
  });

  it("hands a failure to every sheet waiting on it, then lets the cook try again", async () => {
    const first = openSheet(REEL);
    const second = openSheet(SAME_REEL_RESHARED);

    await act(async () => state.settles[0]!.reject(new Error("socket hang up")));

    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    expect(second.result.current.status).toBe("failed");
    expect(state.replaced).toHaveLength(0);

    openSheet(REEL);
    expect(state.calls).toHaveLength(2);
  });

  it("does not navigate a sheet the cook already closed", async () => {
    const sheet = openSheet(REEL);
    sheet.unmount();

    await act(async () => state.settles[0]!.resolve(MINE));

    expect(state.replaced).toHaveLength(0);
  });

  describe("a video another cook already imported", () => {
    it("is favorited, then opened", async () => {
      openSheet(REEL);

      await act(async () => state.settles[0]!.resolve(THEIRS));

      expect(state.favorited).toEqual([{ id: "recipe-1", liked: true }]);
      expect(state.replaced[0]).toMatchObject({ params: { id: "recipe-1" } });
    });

    it("is favorited once, however many sheets wait on it, and even after they closed", async () => {
      openSheet(REEL).unmount();
      openSheet(SAME_REEL_RESHARED).unmount();

      await act(async () => state.settles[0]!.resolve(THEIRS));

      expect(state.favorited).toHaveLength(1);
      expect(state.replaced).toHaveLength(0);
    });
  });

  it("does not favorite a recipe the cook owns", async () => {
    openSheet(REEL);

    await act(async () => state.settles[0]!.resolve(MINE));

    expect(state.favorited).toHaveLength(0);
  });
});
