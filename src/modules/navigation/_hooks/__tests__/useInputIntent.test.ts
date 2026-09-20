import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Intent } from "@shared/inputIntent";

import { useInputIntent } from "../useInputIntent";

/**
 * What Enter means, from both of the places it comes.
 *
 * One seam is mocked and one rule is deliberately left real: the action is a fake, because what it
 * would call costs money and is measured elsewhere, while `readIntent` stays REAL — it is the half
 * that decides whether the action is reached at all, and a fixture that faked it could only assert
 * that the mock was wired up.
 *
 * So the assertions below are about the SEAM between the two: which inputs are answered locally and
 * cost nothing, which are worth a round trip, and what happens to the answer when it comes back.
 */
const state = vi.hoisted(() => ({
  /** What the fake action does. Reassigned per test — a throw is a case, not a failure. */
  answer: (() => Promise.resolve({ kind: "unknown" } as Intent))(),
  /** Every call the action received, which is how "did not ask" is asserted. */
  calls: [] as { text: string; locale: string }[],
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({
    action: (args: { text: string; locale: string }) => {
      state.calls.push(args);

      return state.answer;
    },
    isLoading: false,
  }),
}));

vi.mock("~/lib/convex/api", () => ({ api: { router: { assistant: { classify: { authed: "classify" } } } } }));

/** The catalog found a confident match for what was typed. */
const MATCHED = { hasCatalogHit: true, hasRecipeHit: false };
/** Neither the catalog nor the recipe titles could explain it — both guesses are reachable. */
const NOTHING = { hasCatalogHit: false, hasRecipeHit: false };

const answering = (intent: Intent) => { state.answer = Promise.resolve(intent); };

const resolve = (text: string, evidence: typeof MATCHED) =>
  renderHook(() => useInputIntent()).result.current.resolve(text, evidence);

beforeEach(() => {
  state.calls = [];
  answering({ kind: "unknown" });
});

describe("the four written rules", () => {
  /**
   * The highest-value assertion in this file. Each of these is something the shopper typed on
   * purpose, and a model that could be consulted about them is a model that could overrule them —
   * which is how "? tomate" becomes a tomato again.
   */
  test.each([
    ["? tomate", MATCHED, { kind: "chat", reason: "question" }],
    ["c'est quoi le yuzu", MATCHED, { kind: "chat", reason: "trigger" }],
    ["tomate", MATCHED, { kind: "ingredient" }],
    ["boeuf bourguignon", { hasCatalogHit: false, hasRecipeHit: true }, { kind: "recipe" }],
  ])("%s is answered locally, and nothing is asked", async (text, evidence, expected) => {
    await expect(resolve(text, evidence)).resolves.toEqual(expected);
    expect(state.calls).toEqual([]);
  });
});

describe("the two guesses", () => {
  test("the fall-through is worth asking about", async () => {
    answering({ kind: "recipe" });

    await expect(resolve("boeuf bourguignon", NOTHING)).resolves.toEqual({ kind: "recipe" });
    expect(state.calls).toEqual([{ text: "boeuf bourguignon", locale: "fr" }]);
  });

  test("so is the word count", async () => {
    answering({ kind: "ingredient" });

    await expect(resolve("huile olive vierge extra", NOTHING)).resolves.toEqual({ kind: "ingredient" });
    expect(state.calls).toHaveLength(1);
  });

  /** The quantity travels: it is the strongest evidence there is that a phrase names a food. */
  test("the model is asked about what was typed, quantity and all", async () => {
    await resolve("500g yuzu", NOTHING);

    expect(state.calls[0]?.text).toBe("500g yuzu");
  });

  test("an empty box asks nothing", async () => {
    await expect(resolve("   ", NOTHING)).resolves.toEqual({ kind: "unknown" });
    expect(state.calls).toEqual([]);
  });
});

/**
 * The promise the bar is built on: the worst this can do is cost a round trip.
 *
 * Both cases below keep the LOCAL answer, and the two local answers differ — the fall-through keeps
 * `unknown` and goes to the resolver, the word count keeps `chat/sentence` and goes to the
 * assistant. Asserting only one of them would pass on a hook that returned a hardcoded `unknown`.
 */
describe("when the model has nothing to add", () => {
  test("no opinion keeps the fall-through's own answer", async () => {
    answering({ kind: "unknown" });

    await expect(resolve("yuzu", NOTHING)).resolves.toEqual({ kind: "unknown" });
  });

  test("no opinion keeps the word count's own answer", async () => {
    answering({ kind: "unknown" });

    await expect(resolve("huile olive vierge extra", NOTHING)).resolves.toEqual({
      kind: "chat",
      reason: "sentence",
    });
  });

  test("a call that never returns keeps the local answer, and does not reject", async () => {
    state.answer = Promise.reject(new Error("offline"));
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(resolve("huile olive vierge extra", NOTHING)).resolves.toEqual({
      kind: "chat",
      reason: "sentence",
    });
    expect(logged).toHaveBeenCalled();
  });
});
