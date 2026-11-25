import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecipe } from "../useRecipe";

/**
 * Which read a recipe is drawn from: the cook's own with a session, the open one without, and
 * neither while auth has not decided.
 */
type Answer = { data?: unknown; error?: Error };

const state = vi.hoisted(() => ({
  auth: {} as { hasSession: boolean; isAuthenticating: boolean },
  asked: [] as { name: string; args: unknown }[],
  answers: {} as Record<string, { data?: unknown; error?: Error }>,
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));
vi.mock("~/lib/convex/auth", () => ({ useAuthenticated: () => state.auth }));
vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown): Answer => {
    if (args === "skip") return {};
    const name = getFunctionName(fn as never);
    state.asked.push({ name, args });
    return state.answers[name] ?? {};
  },
}));

const AUTHED = "router/recipes/getOne:authed";
const ANON = "router/recipes/getOne:anon";

const RECIPE = { id: "k57abc", title: "Gratin", servings: 4, ingredients: [], instructions: [] };

const reading = () => renderHook(() => useRecipe("k57abc"), { wrapper: Provider }).result.current;

const askedNames = () => [...new Set(state.asked.map(({ name }) => name))];

beforeEach(() => {
  state.asked = [];
  state.answers = { [AUTHED]: { data: { ...RECIPE, isOwned: true } }, [ANON]: { data: RECIPE } };
});

describe("useRecipe", () => {
  /** A stored session is enough: the signed-out payload is never drawn to a cook, even for a frame. */
  it.each([
    { hasSession: true, isAuthenticating: false },
    { hasSession: true, isAuthenticating: true },
  ])("reads as the cook with a session (%o)", (auth) => {
    state.auth = auth;

    expect(reading().recipe?.isOwned).toBe(true);
    expect(askedNames()).toEqual([AUTHED]);
  });

  it("reads the open recipe signed out, in the reader's language", () => {
    state.auth = { hasSession: false, isAuthenticating: false };

    expect(reading().recipe?.title).toBe("Gratin");
    expect(askedNames()).toEqual([ANON]);
    expect(state.asked[0]?.args).toEqual({ id: "k57abc", locale: "fr" });
  });

  it("asks nothing and reads as loading while auth is deciding", () => {
    state.auth = { hasSession: false, isAuthenticating: true };

    const { recipe, isLoading, isMissing } = reading();

    expect(askedNames()).toEqual([]);
    expect(recipe).toBeUndefined();
    expect(isLoading).toBe(true);
    expect(isMissing).toBe(false);
  });

  it("reports a recipe the server refuses as missing, signed out too", () => {
    state.auth = { hasSession: false, isAuthenticating: false };
    state.answers[ANON] = { error: new Error("NOT_FOUND") };

    expect(reading().isMissing).toBe(true);
  });
});
