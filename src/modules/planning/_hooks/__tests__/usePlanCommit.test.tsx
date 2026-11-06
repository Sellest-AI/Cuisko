import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftMeal } from "../../_model/model";
import { draftMealsAtom, shuffleSeedAtom } from "../atoms";
import { usePlanCommit } from "../usePlanCommit";

/**
 * The promise this file pins: a week kept is the only outcome of the last step that asks for a
 * store review. `commit` also resolves `true` with nothing to keep, so its answer cannot tell.
 *
 * Convex is mocked at `~/lib/convex/client`, and the write settles as the test sets it.
 */
const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  writes: 0,
  fails: false,
  reviewAsks: 0,
}));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/askForReview", () => ({
  askForReview: () => {
    state.reviewAsks += 1;
  },
}));

vi.mock("~/lib/convex/client", () => ({
  useMutation: () => ({
    mutate: () => {
      state.writes += 1;
      return state.fails ? Promise.reject(new Error("offline")) : Promise.resolve(null);
    },
    isLoading: false,
  }),
}));

const MEAL: DraftMeal = {
  id: "meal-1",
  recipeId: "recipe-1",
  date: new Date(2026, 10, 9),
  slot: "dinner",
  servings: 2,
  title: "Hachis parmentier",
  ingredients: [],
  alternatives: [],
};

let store: ReturnType<typeof createStore>;

const commit = async () => {
  const { result } = renderHook(() => usePlanCommit(), {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  });

  let kept: boolean | undefined;
  await act(async () => {
    kept = await result.current.commit();
  });

  return kept;
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  store = createStore();
  store.set(draftMealsAtom, [MEAL]);
  store.set(shuffleSeedAtom, 7);
  state.householdId = "household-1";
  state.writes = 0;
  state.fails = false;
  state.reviewAsks = 0;
});

describe("usePlanCommit", () => {
  it("asks for a review once the week is kept", async () => {
    expect(await commit()).toBe(true);

    expect(state.writes).toBe(1);
    expect(state.reviewAsks).toBe(1);
  });

  it("does not ask for a review when the write fails", async () => {
    state.fails = true;

    expect(await commit()).toBe(false);

    expect(state.reviewAsks).toBe(0);
  });

  it("does not ask for a review when there was no plate to keep", async () => {
    store.set(draftMealsAtom, []);

    expect(await commit()).toBe(true);

    expect(state.writes).toBe(0);
    expect(state.reviewAsks).toBe(0);
  });
});
