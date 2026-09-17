import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { constraintsAtom, daysAtom, equipmentsAtom, planAfterAtom, seeksAtom } from "../atoms";
import { usePlanDraft } from "../usePlanDraft";
import { dayOffset } from "./fixtures";

/**
 * The seam `_model/model.test.ts` cannot reach: that the draft asks the server for exactly the days
 * the tunnel seeded, and asks for nothing before it has them.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through:
 * `getDraft` records the arguments it was asked with and answers an empty week. The start of the
 * week is set on `planAfterAtom` directly — seeding it is `useTunnel`'s job, tested there.
 */
const state = vi.hoisted(() => ({
  draftArgs: [] as unknown[],
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: "household-1", isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown) => {
    if (args === "skip") return { data: undefined, isPending: true, isError: false };

    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

    if (name.includes("getDraft")) {
      state.draftArgs.push(args);
      return { data: [], isPending: false, isError: false };
    }

    throw new Error(`Unmocked query: ${name}`);
  },
}));

let store: ReturnType<typeof createStore>;

beforeEach(() => {
  state.draftArgs = [];
  store = createStore();
  store.set(constraintsAtom, []);
  store.set(daysAtom, 3);
});

const draft = () =>
  renderHook(() => usePlanDraft({ seed: 0.5 }), {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  });

const asked = () =>
  state.draftArgs.at(-1) as { dates: number[]; equipments: string[]; seeks: string[] } | undefined;

describe("usePlanDraft", () => {
  it("asks for nothing until the tunnel has seeded where the week starts", () => {
    const { result } = draft();

    expect(result.current.isGenerating).toBe(true);
    expect(state.draftArgs).toEqual([]);
  });

  it("asks for the days after the seeded start, as many as the run wants", () => {
    store.set(planAfterAtom, new Date(dayOffset(4)));

    const { result } = draft();

    expect(asked()?.dates).toEqual([dayOffset(5), dayOffset(6), dayOffset(7)]);
    expect(result.current.isGenerating).toBe(false);
  });

  /** The utensils step's answer, as ticked, so the server never has to read a row being written. */
  it("sends the kitchen the tunnel collected", () => {
    store.set(planAfterAtom, new Date(dayOffset(4)));
    store.set(equipmentsAtom, ["microwave"]);

    draft();

    expect(asked()?.equipments).toEqual(["microwave"]);
  });

  /** The focus step's answer reaches the week; before the seed lands it reads as nothing sought. */
  it("sends the focus step's seeks, and none before they are seeded", () => {
    store.set(planAfterAtom, new Date(dayOffset(4)));

    draft();
    expect(asked()?.seeks).toEqual([]);

    store.set(seeksAtom, ["high-protein"]);
    draft();
    expect(asked()?.seeks).toEqual(["high-protein"]);
  });
});
