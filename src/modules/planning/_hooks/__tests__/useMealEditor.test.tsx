import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftMeal } from "../../_model/model";
import { draftMealsAtom } from "../atoms";
import { useMealEditor, type MealScope, type MealTarget } from "../useMealEditor";

/**
 * Where a tap on a tile lands, per week: the kept plate's own swap, `planOne` on an empty slot of
 * the kept week, and `getDraftMeal` into the atom on the draft.
 *
 * The two hooks this one composes are mocked at their own doors — `useKeptMeal` is the server
 * seam for a kept plate and has its own test; `useMealCatalog` is the grid and has its own too.
 * Convex is mocked at `~/lib/convex/client` for the two calls this hook makes itself.
 */
const DAY = new Date(2026, 7, 13);

const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  kept: {
    meal: undefined as { id: string; recipeId: string; date: Date; slot: string; servings: number } | undefined,
    isLoading: false,
    isMissing: false,
    failed: false,
    servings: undefined as number | undefined,
    setServings: vi.fn(),
    setRecipe: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  },
  catalogArgs: undefined as { query: string; pinned: string | undefined } | undefined,
  writes: [] as { name: string; args: Record<string, unknown> }[],
  queries: [] as { name: string; args: Record<string, unknown> }[],
  answer: undefined as Record<string, unknown> | undefined,
  refuse: false,
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useMutation: (fn: unknown) => ({
    mutate: async (args: Record<string, unknown>) => {
      state.writes.push({ name: getFunctionName(fn as never), args });
      if (state.refuse) throw new Error("refused");
    },
  }),
  useConvex: () => ({
    query: async (fn: unknown, args: Record<string, unknown>) => {
      state.queries.push({ name: getFunctionName(fn as never), args });
      if (state.refuse) throw new Error("refused");

      return state.answer;
    },
  }),
}));

vi.mock("../useKeptMeal", () => ({ useKeptMeal: () => state.kept }));

vi.mock("../useMealCatalog", () => ({
  useMealCatalog: (query: string, pinned: string | undefined) => {
    state.catalogArgs = { query, pinned };

    return { recipes: [], isSearching: false, isLoading: false, isStale: false };
  },
}));

const CHOICE = { id: "recipe-new", title: "Soupe" };

/** `getDraftMeal`'s answer for `CHOICE`: one line, the plate's day as a timestamp. */
const answerFor = (date: Date, slot: string, servings: number) => ({
  recipeId: "recipe-new", date: date.getTime(), slot, servings, title: "Soupe", minutes: 20,
  ingredients: [{ ingredientId: "tomato", name: "Tomates", emoji: "🍅", category: "VEGETABLE", amount: 300, unit: "g", covered: false }],
});

const draftPlate = (id: string, date: Date, slot: "lunch" | "dinner"): DraftMeal => ({
  id, recipeId: "recipe-old", date, slot, servings: 2, title: "Ancien", ingredients: [],
});

let store: ReturnType<typeof createStore>;

beforeEach(() => {
  state.householdId = "household-1";
  state.kept.meal = undefined;
  state.kept.setRecipe = vi.fn(async () => true);
  state.catalogArgs = undefined;
  state.writes = [];
  state.queries = [];
  state.answer = undefined;
  state.refuse = false;
  store = createStore();
});

const editor = (target: MealTarget, scope: MealScope) =>
  renderHook(() => useMealEditor(target, scope), {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  });

/** Runs `choose` inside act and hands back what it resolved to. */
const choose = async (result: { current: ReturnType<typeof useMealEditor> }) => {
  let landed: boolean | undefined;
  await act(async () => { landed = await result.current.choose(CHOICE); });

  return landed;
};

describe("useMealEditor", () => {
  describe("on a kept plate", () => {
    beforeEach(() => {
      state.kept.meal = { id: "meal-1", recipeId: "recipe-old", date: DAY, slot: "lunch", servings: 2 };
    });

    it("pins the dish on the plate in the grid", () => {
      editor({ kind: "meal", mealId: "meal-1" }, "plan");

      expect(state.catalogArgs?.pinned).toBe("recipe-old");
    });

    it("swaps through the kept plate's own seam", async () => {
      const { result } = editor({ kind: "meal", mealId: "meal-1" }, "plan");

      expect(await choose(result)).toBe(true);
      expect(state.kept.setRecipe).toHaveBeenCalledWith("recipe-new");
      expect(state.writes).toHaveLength(0);
      expect(state.queries).toHaveLength(0);
    });
  });

  describe("on an empty slot of the kept week", () => {
    const target: MealTarget = { kind: "slot", date: DAY, slot: "dinner" };

    it("writes the plate through planOne for the portions shown", async () => {
      const { result } = editor(target, "plan");

      act(() => result.current.setServings(5));

      expect(await choose(result)).toBe(true);
      expect(state.writes).toHaveLength(1);
      expect(state.writes[0]!.name).toContain("planOne");
      expect(state.writes[0]!.args).toMatchObject({
        householdId: "household-1", recipeId: "recipe-new", date: DAY.getTime(), slot: "dinner", servings: 5,
      });
      expect(result.current.failed).toBe(false);
    });

    it("stays open and says so when the server refuses", async () => {
      state.refuse = true;
      const { result } = editor(target, "plan");

      expect(await choose(result)).toBe(false);
      expect(result.current.failed).toBe(true);
    });
  });

  describe("on a draft plate", () => {
    const plateId = "2026-08-13:lunch";

    beforeEach(() => {
      store.set(draftMealsAtom, [draftPlate(plateId, DAY, "lunch")]);
      state.answer = answerFor(DAY, "lunch", 2);
    });

    it("asks getDraftMeal for the dish on the plate's day, slot and portions, and replaces the plate in the atom", async () => {
      const { result } = editor({ kind: "meal", mealId: plateId }, "draft");

      expect(await choose(result)).toBe(true);
      expect(state.queries).toHaveLength(1);
      expect(state.queries[0]!.name).toContain("getDraftMeal");
      expect(state.queries[0]!.args).toMatchObject({
        householdId: "household-1", recipeId: "recipe-new", date: DAY.getTime(), slot: "lunch", servings: 2, locale: "fr",
      });

      const [plate] = store.get(draftMealsAtom);
      expect(plate).toMatchObject({ id: plateId, recipeId: "recipe-new", title: "Soupe", servings: 2 });
      expect(plate!.ingredients).toHaveLength(1);
      /** The swap changed the dish, not the plate: the same id, now holding the new recipe. */
      expect(result.current.meal?.recipeId).toBe("recipe-new");
    });

    it("leaves the atom alone and says so when the read is refused", async () => {
      state.refuse = true;
      const { result } = editor({ kind: "meal", mealId: plateId }, "draft");

      expect(await choose(result)).toBe(false);
      expect(store.get(draftMealsAtom)[0]?.recipeId).toBe("recipe-old");
      expect(result.current.failed).toBe(true);
    });

    it("is missing when the plate is not in the draft", () => {
      const { result } = editor({ kind: "meal", mealId: "elsewhere" }, "draft");

      expect(result.current.missing).toBe(true);
    });
  });

  describe("on an empty slot of the draft", () => {
    const target: MealTarget = { kind: "slot", date: DAY, slot: "dinner" };

    it("fills the slot with the dish, for the portions the slider was set to", async () => {
      state.answer = answerFor(DAY, "dinner", 3);
      const { result } = editor(target, "draft");

      act(() => result.current.setServings(3));

      expect(await choose(result)).toBe(true);
      expect(state.queries[0]!.args).toMatchObject({ date: DAY.getTime(), slot: "dinner", servings: 3 });

      const [plate] = store.get(draftMealsAtom);
      expect(plate).toMatchObject({ id: "2026-08-13:dinner", recipeId: "recipe-new", servings: 3 });
    });
  });
});
