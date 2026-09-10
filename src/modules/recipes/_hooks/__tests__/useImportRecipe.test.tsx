import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { createStore, Provider, useAtomValue } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { importedDraftAtom } from "../atoms";
import { useImportRecipe } from "../useImportRecipe";

/**
 * The seam between a scrape and a form the cook can correct.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through,
 * and the action is left hanging so a test can hold the wait open and act during it. What is being
 * asserted is the handover, not the scrape: that a success puts the draft somewhere the editor will
 * find it AND changes the route, and that a failure does neither.
 */
const state = vi.hoisted(() => ({
  /** How many times the action was actually invoked. The whole point of the guard. */
  calls: 0,
  urls: [] as string[],
  settle: undefined as
    | { resolve: (draft: unknown) => void; reject: (reason: unknown) => void }
    | undefined,
  replaced: [] as string[],
}));

vi.mock("expo-router", () => ({
  router: { replace: (href: string) => state.replaced.push(href) },
}));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({
    action: ({ url }: { url: string }) => {
      state.calls += 1;
      state.urls.push(url);

      return new Promise((resolve, reject) => {
        state.settle = { resolve, reject };
      });
    },
  }),
}));

const DRAFT = {
  title: "Lasagne",
  description: "",
  servings: 6,
  ingredients: "500 g beef mince",
  instructions: "- Cook it.",
};

/**
 * The hook and the atom together, since the handover between them is the subject.
 *
 * Each render gets its OWN Jotai store. Jotai's default store is module-global, so without this a
 * draft written by one test is still sitting there for the next one — which is exactly how the
 * "a failure leaves the atom untouched" case below passed on the previous test's success.
 */
const renderImport = () => {
  const store = createStore();

  return renderHook(
    () => ({
      ...useImportRecipe(),
      draft: useAtomValue(importedDraftAtom),
    }),
    { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> },
  );
};

beforeEach(() => {
  state.calls = 0;
  state.urls = [];
  state.settle = undefined;
  state.replaced = [];
});

describe("useImportRecipe", () => {
  it("puts the draft where the editor will find it, and goes there", async () => {
    const { result } = renderImport();

    act(() => void result.current.importFrom("https://example.com/lasagne"));
    await waitFor(() => expect(result.current.isImporting).toBe(true));

    act(() => state.settle?.resolve(DRAFT));

    await waitFor(() => expect(result.current.draft).toEqual(DRAFT));
    expect(state.replaced).toEqual(["/recipe/new"]);
    expect(result.current.isImporting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("imports once however many times it is asked while the first is in flight", async () => {
    const { result } = renderImport();

    act(() => void result.current.importFrom("https://example.com/lasagne"));
    await waitFor(() => expect(result.current.isImporting).toBe(true));

    act(() => void result.current.importFrom("https://example.com/lasagne"));
    act(() => void result.current.importFrom("https://example.com/lasagne"));

    expect(state.calls).toBe(1);
  });

  it("hands the action a completed address rather than what was pasted", async () => {
    const { result } = renderImport();

    act(() => void result.current.importFrom("  marmiton.org/recettes/gateau  "));
    await waitFor(() => expect(state.calls).toBe(1));

    expect(state.urls).toEqual(["https://marmiton.org/recettes/gateau"]);
  });

  describe("when it fails", () => {
    it("leaves the screen answerable, with the error to render and the atom untouched", async () => {
      const { result } = renderImport();

      act(() => void result.current.importFrom("https://example.com/not-a-recipe"));
      await waitFor(() => expect(result.current.isImporting).toBe(true));

      const refusal = new ConvexError({ code: "UNREADABLE_PAGE", message: "no recipe" });
      act(() => state.settle?.reject(refusal));

      await waitFor(() => expect(result.current.error).toBe(refusal));
      expect(result.current.isImporting).toBe(false);
      expect(result.current.draft).toBeUndefined();
      expect(state.replaced).toEqual([]);
    });

    /** The refusal that costs nothing: knowable here, so no round trip is spent finding out. */
    it("refuses an address that is not one without calling the action at all", async () => {
      const { result } = renderImport();

      act(() => void result.current.importFrom("javascript:alert(1)"));

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(state.calls).toBe(0);
      expect(state.replaced).toEqual([]);
      expect((result.current.error as ConvexError<{ code: string }>).data.code).toBe(
        "INVALID_INPUT",
      );
    });

    it("lets the cook try again after a failure", async () => {
      const { result } = renderImport();

      act(() => void result.current.importFrom("javascript:alert(1)"));
      await waitFor(() => expect(result.current.error).toBeTruthy());

      act(() => void result.current.importFrom("https://example.com/lasagne"));
      await waitFor(() => expect(state.calls).toBe(1));

      act(() => state.settle?.resolve(DRAFT));
      await waitFor(() => expect(result.current.draft).toEqual(DRAFT));
      expect(result.current.error).toBeNull();
    });
  });
});
