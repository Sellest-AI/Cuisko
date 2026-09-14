import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLANNABLE_DAYS, usePlanRecipe } from "../usePlanRecipe";
import { dayOffset, keptMeal } from "./fixtures";

/**
 * The seam between the plan-a-recipe sheet and the server: which days are asked for, how the
 * chosen slot splits them, and what goes up when a tile is tapped.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through.
 */
type Deferred = { resolve: () => void; reject: (error: unknown) => void };

const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  read: { status: "success" as "pending" | "success", data: undefined as unknown },
  queries: [] as { name: string; args: unknown }[],
  writes: [] as { name: string; args: Record<string, unknown>; settle: Deferred }[],
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown) => {
    if (args === "skip") return { status: "pending", data: undefined };

    state.queries.push({ name: getFunctionName(fn as never), args });

    return state.read;
  },
  useMutation: (fn: unknown) => ({
    isLoading: false,
    mutate: (args: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => {
        state.writes.push({ name: getFunctionName(fn as never), args, settle: { resolve, reject } });
      }),
  }),
}));

beforeEach(() => {
  state.householdId = "household-1";
  state.read = { status: "success", data: [] };
  state.queries = [];
  state.writes = [];
});

const plan = (initialServings?: number) =>
  renderHook(() => usePlanRecipe({ recipeId: "recipe-1", initialServings }));

/** Lets the settled promise's continuation run inside React's act. */
const settle = (write: { settle: Deferred }, outcome: "ok" | "refused" = "ok") =>
  act(async () => {
    if (outcome === "ok") write.settle.resolve();
    else write.settle.reject(new Error("refused"));
    await Promise.resolve();
  });

describe("usePlanRecipe", () => {
  it("asks for today and the eight days after it, for this household, in its locale", () => {
    plan(2);

    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]!.name).toContain("getMany");
    expect(state.queries[0]!.args).toEqual({
      householdId: "household-1",
      locale: "fr",
      from: dayOffset(0),
      to: dayOffset(PLANNABLE_DAYS),
    });
  });

  it("offers nine tiles, the first of them today", () => {
    const { result } = plan(2);

    expect(result.current.days).toHaveLength(PLANNABLE_DAYS);
    expect(result.current.days[0]!.date.getTime()).toBe(dayOffset(0));
    expect(result.current.days[8]!.date.getTime()).toBe(dayOffset(8));
  });

  it("puts each plate on its day at the chosen slot, and swaps them with the slot", () => {
    state.read = {
      status: "success",
      data: [keptMeal("lunch-2", 2, "lunch"), keptMeal("dinner-2", 2, "dinner"), keptMeal("dinner-5", 5, "dinner")],
    };
    const { result } = plan(2);

    expect(result.current.days.map((day) => day.meal?.id)).toEqual([
      undefined, undefined, "lunch-2", undefined, undefined, undefined, undefined, undefined, undefined,
    ]);

    act(() => result.current.setSlot("dinner"));

    expect(result.current.days.map((day) => day.meal?.id)).toEqual([
      undefined, undefined, "dinner-2", undefined, undefined, "dinner-5", undefined, undefined, undefined,
    ]);
  });

  it("opens on the seeded portions until the slider moves, then keeps the slider's", () => {
    const { result, rerender } = plan(undefined);

    expect(result.current.servings).toBeUndefined();

    rerender();
    const { result: seeded } = plan(3);
    expect(seeded.current.servings).toBe(3);

    act(() => seeded.current.setServings(5));
    expect(seeded.current.servings).toBe(5);
  });

  it("sends the tapped day, the chosen slot and the portions, and resolves true once the plate lands", async () => {
    const { result } = plan(2);
    act(() => result.current.setSlot("dinner"));
    act(() => result.current.setServings(4));

    let landed: boolean | undefined;
    act(() => {
      void result.current.plan(result.current.days[3]!.date).then((outcome) => { landed = outcome; });
    });

    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.name).toContain("planOne");
    expect(state.writes[0]!.args).toMatchObject({
      householdId: "household-1",
      recipeId: "recipe-1",
      date: dayOffset(3),
      slot: "dinner",
      servings: 4,
      today: dayOffset(0),
    });

    await settle(state.writes[0]!);
    expect(landed).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it("resolves false and says so when the server refuses the plate", async () => {
    const { result } = plan(2);

    let landed: boolean | undefined;
    act(() => {
      void result.current.plan(result.current.days[0]!.date).then((outcome) => { landed = outcome; });
    });
    await settle(state.writes[0]!, "refused");

    expect(landed).toBe(false);
    expect(result.current.failed).toBe(true);
  });

  it("writes nothing without a household or before the portions are known", async () => {
    state.householdId = undefined;
    const { result } = plan(2);
    expect(await result.current.plan(result.current.days[0]!.date)).toBe(false);

    state.householdId = "household-1";
    const { result: unseeded } = plan(undefined);
    expect(await unseeded.current.plan(unseeded.current.days[0]!.date)).toBe(false);

    expect(state.writes).toHaveLength(0);
  });
});
