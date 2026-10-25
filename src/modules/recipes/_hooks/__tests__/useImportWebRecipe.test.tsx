import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { importsInFlightAtom } from "../atoms";
import { useImportWebRecipe } from "../useImportWebRecipe";

/**
 * What the chat's card reads while Add runs: the bar, then "In your recipes", or why it failed.
 *
 * Convex is mocked at `~/lib/convex/client` as `useImportSharedLink.test.tsx` mocks it: every call
 * is left hanging, named by the function it reached, so a test can mount a second card mid-import
 * and settle the scrape and the save one at a time. The cards share one Jotai store, as a chat
 * closed and reopened does.
 */
type Call = {
  name: string;
  args: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const state = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => ({
    action: (args: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        state.calls.push({ name: getFunctionName(ref), args, resolve, reject });
      }),
  }),
  useMutation: () => ({ mutate: () => Promise.resolve(null), isLoading: false }),
}));

const PAGE = "https://www.marmiton.org/recettes/recette_hachis-parmentier_12345.aspx";
const KEY = "marmiton.org/recettes/recette_hachis-parmentier_12345.aspx";
const STARTED_AT = 1_760_000_000_000;

/** The page as `importOne` reads it: no description, as many pages have none. */
const DRAFT = {
  title: "Hachis parmentier",
  description: "",
  servings: 6,
  ingredients: "1 kg de pommes de terre\n600 g de boeuf haché",
  instructions: "Cuire les pommes de terre.",
  sourceUrl: PAGE,
};

let store: ReturnType<typeof createStore>;
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

const mountCard = () => renderHook(() => useImportWebRecipe(PAGE), { wrapper });

const _names = () => state.calls.map(({ name }) => name);

/** The scrape answers with the draft, then the save with the new recipe's id. */
const _land = async (recipeId = "recipe-1") => {
  await act(async () => state.calls[0]!.resolve(DRAFT));
  await act(async () => state.calls[1]!.resolve(recipeId));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(STARTED_AT);
  store = createStore();
  state.calls = [];
});

afterEach(() => vi.useRealTimers());

describe("useImportWebRecipe", () => {
  it("is idle until Add", () => {
    expect(mountCard().result.current).toMatchObject({ status: "idle" });
    expect(state.calls).toHaveLength(0);
  });

  it("scrapes the page, its bar filling over 30 s", () => {
    const card = mountCard();

    act(() => card.result.current.start());
    expect(_names()).toEqual(["router/recipes/importOne:authed"]);
    expect(state.calls[0]!.args).toEqual({ url: PAGE });
    expect(card.result.current).toMatchObject({ status: "importing", progress: 0 });

    act(() => vi.advanceTimersByTime(15_000));
    expect(card.result.current.progress).toBeCloseTo(0.475);
  });

  /** The editor's Save, with no editor: the draft as it came, in the cook's language, blanks left out. */
  it("saves the scraped page as the cook's recipe, then turns into it", async () => {
    const card = mountCard();
    act(() => card.result.current.start());

    await act(async () => state.calls[0]!.resolve(DRAFT));
    expect(_names()).toEqual(["router/recipes/importOne:authed", "router/recipes/createOne:authed"]);
    expect(state.calls[1]!.args).toEqual({ ...DRAFT, description: undefined, locale: "fr" });
    expect(card.result.current.status).toBe("importing");

    await act(async () => state.calls[1]!.resolve("recipe-1"));
    expect(card.result.current).toMatchObject({ status: "done", recipeId: "recipe-1" });
  });

  it("does not start a second import of the page while the first runs", () => {
    const card = mountCard();
    const other = mountCard();

    act(() => card.result.current.start());
    act(() => card.result.current.start());
    act(() => other.result.current.start());

    expect(state.calls).toHaveLength(1);
  });

  /** A chat closed and reopened mid-add: the new card shows the bar, then the recipe, not Add. */
  it("joins the import running for its page when it mounts", async () => {
    const first = mountCard();
    act(() => first.result.current.start());
    first.unmount();
    act(() => vi.advanceTimersByTime(10_000));

    const reopened = mountCard();
    expect(reopened.result.current.status).toBe("importing");
    expect(reopened.result.current.progress).toBeGreaterThan(0.3);

    await _land();

    expect(reopened.result.current).toMatchObject({ status: "done", recipeId: "recipe-1" });
    expect(state.calls).toHaveLength(2);
  });

  /** The chat closed and reopened after the add: the card is the recipe, and Add cannot pay for a second copy. */
  it("shows the recipe on a card mounted after its page was added, and starts no second import", async () => {
    const first = mountCard();
    act(() => first.result.current.start());
    first.unmount();
    await _land();

    const reopened = mountCard();
    expect(reopened.result.current).toMatchObject({ status: "done", recipeId: "recipe-1" });

    act(() => reopened.result.current.start());
    expect(state.calls).toHaveLength(2);
  });

  it("says why the scrape failed, as a web import, saves nothing, and lets the cook try again", async () => {
    const card = mountCard();
    act(() => card.result.current.start());

    await act(async () =>
      state.calls[0]!.reject(new ConvexError({ code: "UNREADABLE_PAGE", message: "No recipe on that page" })),
    );

    expect(card.result.current).toMatchObject({ status: "failed", failure: { title: "Import.unreadable_title" } });
    expect(_names()).toEqual(["router/recipes/importOne:authed"]);

    act(() => card.result.current.start());
    expect(state.calls).toHaveLength(2);
    expect(card.result.current.status).toBe("importing");
  });

  it("says the limit was reached when the save is refused for it", async () => {
    const card = mountCard();
    act(() => card.result.current.start());

    await act(async () => state.calls[0]!.resolve(DRAFT));
    await act(async () =>
      state.calls[1]!.reject(new ConvexError({ code: "RATE_LIMITED", message: "Too many", retryAfter: 1000 })),
    );

    expect(card.result.current).toMatchObject({ status: "failed", failure: { title: "Import.limited_title" } });
  });

  /**
   * The cook left the app mid-save: this app will never hear the answer, but the server may still be
   * saving. The card stays importing for 2 minutes, then Add comes back, never a failure.
   */
  it("holds the bar for 2 minutes after the connection is lost, then shows Add", async () => {
    const card = mountCard();
    act(() => card.result.current.start());

    await act(async () => state.calls[0]!.resolve(DRAFT));
    await act(async () => state.calls[1]!.reject(new Error("Connection lost while action was in flight")));

    expect(store.get(importsInFlightAtom).get(KEY)?.status).toBe("lost");
    expect(card.result.current.status).toBe("importing");

    act(() => vi.advanceTimersByTime(2 * 60_000));

    expect(card.result.current.status).toBe("idle");
    expect(card.result.current.failure).toBeUndefined();
  });

  /** The draft never reached the phone, so no save was sent: nothing can land, and the cook is told now. */
  it("fails at once when the scrape is lost with the connection, worded as the connection", async () => {
    const card = mountCard();
    act(() => card.result.current.start());

    await act(async () => state.calls[0]!.reject(new Error("Connection lost while action was in flight")));

    expect(card.result.current).toMatchObject({ status: "failed", failure: { title: "Import.scrape_lost_title" } });
    expect(store.get(importsInFlightAtom).has(KEY)).toBe(false);
    expect(_names()).toEqual(["router/recipes/importOne:authed"]);

    act(() => card.result.current.start());
    expect(state.calls).toHaveLength(2);
  });
});
