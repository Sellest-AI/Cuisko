import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { importsInFlightAtom } from "../atoms";
import { useImportPastedLink } from "../useImportPastedLink";

/**
 * The promise this file pins: a reel pasted into the import screen reaches the video import, and
 * the cook lands on their recipes without waiting for it, while a web page keeps its own road.
 *
 * Both actions are mocked at `~/lib/convex/client` and told apart by what they are called with:
 * only `importVideo` takes a locale. Every call is left hanging, so a test can look at the screen
 * during the import and then settle it.
 */
const state = vi.hoisted(() => ({
  videoCalls: [] as { url: string; locale: string }[],
  webCalls: [] as { url: string }[],
  settles: [] as { resolve: (imported: unknown) => void; reject: (reason: unknown) => void }[],
  replaced: [] as unknown[],
  dismissedTo: [] as unknown[],
  favorited: [] as { id: string; liked: boolean }[],
}));

vi.mock("expo-router", () => ({
  router: {
    replace: (href: unknown) => state.replaced.push(href),
    dismissTo: (href: unknown) => state.dismissedTo.push(href),
  },
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({
    action: (args: { url: string; locale?: string }) => {
      if (args.locale) state.videoCalls.push({ url: args.url, locale: args.locale });
      else state.webCalls.push({ url: args.url });

      return new Promise((resolve, reject) => {
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

const REEL = "https://www.instagram.com/reel/DcTtz3Ftj9I/";
const TIKTOK_SHORT_LINK = "https://vm.tiktok.com/ZNdxYk3Lp/";
const RECIPE_PAGE = "https://www.marmiton.org/recettes/recette_lasagnes.aspx";

let store: ReturnType<typeof createStore>;
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

const paste = async (text: string) => {
  const { result } = renderHook(() => useImportPastedLink(), { wrapper });
  // Not awaited: a web import waits on its scrape, which every call here leaves hanging.
  await act(async () => void result.current.importFrom(text));
  return result;
};

beforeEach(() => {
  store = createStore();
  state.videoCalls = [];
  state.webCalls = [];
  state.settles = [];
  state.replaced = [];
  state.dismissedTo = [];
  state.favorited = [];
});

describe("useImportPastedLink", () => {
  it.each([
    ["a full link", "https://cuisko.app/r/recipe-1"],
    ["a link with no scheme", "cuisko.app/r/recipe-1"],
    ["a link in a sentence", "Regarde cette recette https://cuisko.app/r/recipe-1"],
  ])("opens and likes a Cuisko recipe pasted as %s, with no import", async (_, text) => {
    await paste(text);

    expect(state.favorited).toEqual([{ id: "recipe-1", liked: true }]);
    expect(state.replaced).toEqual([expect.objectContaining({ params: { id: "recipe-1" } })]);
    expect(state.webCalls).toEqual([]);
    expect(state.videoCalls).toEqual([]);
  });

  it("scrapes the same path on another site, which is not a Cuisko recipe", async () => {
    await paste("https://www.marmiton.org/r/recipe-1");

    expect(state.webCalls).toEqual([{ url: "https://www.marmiton.org/r/recipe-1" }]);
    expect(state.favorited).toEqual([]);
  });

  it("starts the video import and goes to the recipes, where the card waits, without waiting for it", async () => {
    await paste(REEL);

    expect(state.videoCalls).toEqual([{ url: REEL, locale: "fr" }]);
    expect(state.webCalls).toEqual([]);
    expect(state.dismissedTo).toEqual(["/recipes"]);
    expect(state.replaced).toEqual([]);
    expect(store.get(importsInFlightAtom).get("instagram.com/reel/DcTtz3Ftj9I")).toMatchObject({
      url: REEL,
      status: "importing",
    });
  });

  it("takes a TikTok short link down the video road too", async () => {
    await paste(TIKTOK_SHORT_LINK);

    expect(state.videoCalls).toEqual([{ url: TIKTOK_SHORT_LINK, locale: "fr" }]);
  });

  it("hands the import an address the card can open, for a reel pasted with no scheme", async () => {
    await paste("  instagram.com/reel/DcTtz3Ftj9I/ ");

    expect(state.videoCalls).toEqual([{ url: "https://instagram.com/reel/DcTtz3Ftj9I/", locale: "fr" }]);
  });

  it("reads the link out of a pasted sentence", async () => {
    await paste(`Check out this video! ${TIKTOK_SHORT_LINK}`);

    expect(state.videoCalls).toEqual([{ url: TIKTOK_SHORT_LINK, locale: "fr" }]);
  });

  it("joins the import already running when the same reel is pasted again", async () => {
    await paste(REEL);
    await paste(`${REEL}?igsh=MWZ0eGx5bGRzZ3Z5aQ==`);

    expect(state.videoCalls).toHaveLength(1);
    expect(state.dismissedTo).toEqual(["/recipes", "/recipes"]);
  });

  it("drops the card of a failed import, with no unhandled rejection", async () => {
    await paste(REEL);

    await act(async () => state.settles[0]!.reject(new ConvexError({ code: "NOT_A_RECIPE" as const, message: "" })));

    expect(store.get(importsInFlightAtom).size).toBe(0);
  });

  it("leaves a web page on the scrape, the screen open until the draft arrives", async () => {
    const result = await paste(RECIPE_PAGE);

    expect(state.webCalls).toEqual([{ url: RECIPE_PAGE }]);
    expect(state.videoCalls).toEqual([]);
    expect(state.dismissedTo).toEqual([]);
    expect(result.current.isImporting).toBe(true);
  });

  it("starts no reel while a web page is still being read, whose draft would pull the cook off their recipes", async () => {
    const result = await paste(RECIPE_PAGE);

    await act(async () => void result.current.importFrom(REEL));

    expect(state.videoCalls).toEqual([]);
    expect(state.dismissedTo).toEqual([]);
  });

  it("refuses text that is no link at all on this screen, with no import started", async () => {
    const result = await paste("lasagnes de mamie");

    expect(state.webCalls).toEqual([]);
    expect(state.videoCalls).toEqual([]);
    expect(state.dismissedTo).toEqual([]);
    expect(result.current.error).toBeInstanceOf(ConvexError);
  });
});
