import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePendingIngredients } from "../usePendingIngredients";

/**
 * What a ghost does when a step after the resolve fails.
 *
 * `useGroceryList.test.tsx` covers the writes themselves; this file covers the one decision only
 * this hook makes — whether the placeholder card comes down. Three ways a word can fail to become a
 * line, and the shopper must be able to tell them apart: the resolve threw, the resolver refused,
 * or the resolve answered and the *write* was rejected. The third is the one that used to be
 * invisible, because `apply` holds its failure rather than throwing.
 *
 * `useStockActions` is mocked rather than driven through a fake Convex client: its own contract —
 * that it reports whether the write landed — is asserted in its own test, and repeating it here
 * would test the mock twice and this hook's branch not at all.
 */
const stock = vi.hoisted(() => ({ applied: true as boolean, calls: [] as unknown[][] }));
const resolveAction = vi.hoisted(() => vi.fn());

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({ action: resolveAction }),
}));

vi.mock("../useStockActions", () => ({
  useStockActions: () => ({
    apply: (...args: unknown[]) => {
      stock.calls.push(args);
      return Promise.resolve(stock.applied);
    },
    forceRemove: () => Promise.resolve(true),
    error: null,
  }),
}));

const CARROT = "carrot-id";

const MATCHED = {
  status: "matched" as const,
  ingredientId: CARROT,
  name: "Carotte",
  defaultUnit: "g" as const,
  defaultQuantity: 200,
};

const ghosts = () => renderHook(() => usePendingIngredients(), { wrapper: Provider });

beforeEach(() => {
  stock.applied = true;
  stock.calls = [];
  resolveAction.mockReset();
  resolveAction.mockResolvedValue(MATCHED);
});

describe("usePendingIngredients", () => {
  it("drops the ghost once the line has actually landed", async () => {
    const { result } = ghosts();

    await act(() => result.current.add("carotte", "relist", null, null));

    expect(result.current.pending).toHaveLength(0);
    expect(stock.calls).toHaveLength(1);
  });

  /**
   * The bug this file exists for. `apply` resolves whether or not the write landed, so dropping
   * unconditionally took the card down on a rejected write — no line, no ghost, and nothing said.
   */
  it("keeps the ghost as a failure when the write is rejected", async () => {
    stock.applied = false;
    const { result } = ghosts();

    await act(() => result.current.add("carotte", "relist", null, null));

    expect(result.current.pending).toMatchObject([
      { name: "carotte", state: "failed", reason: "error" },
    ]);
  });

  it("keeps the ghost as a failure when the resolve throws", async () => {
    resolveAction.mockRejectedValue(new Error("the model never answered"));
    const { result } = ghosts();

    await act(() => result.current.add("carotte", "relist", null, null));

    expect(result.current.pending).toMatchObject([{ state: "failed", reason: "error" }]);
    expect(stock.calls).toHaveLength(0);
  });

  /** The server's own judgement, which is worth wording differently from our failure. */
  it("carries a refusal's reason onto the card", async () => {
    resolveAction.mockResolvedValue({ status: "refused", reason: "not-food" });
    const { result } = ghosts();

    await act(() => result.current.add("liquide vaisselle", "relist", null, null));

    expect(result.current.pending).toMatchObject([{ state: "failed", reason: "not-food" }]);
    expect(stock.calls).toHaveLength(0);
  });

  /**
   * `pickQuantity` at the seam it was extracted for: the bar knows what was typed and nothing about
   * the food, so an amount with no unit must not be paired with the row's unit — two packets of
   * gnocchi are not two grams.
   */
  it("does not pair a typed amount with the resolved row's unit", async () => {
    const { result } = ghosts();

    await act(() => result.current.add("gnocchis", "relist", null, 2));

    expect(stock.calls[0]).toMatchObject([
      "relist",
      { ingredientId: CARROT, unit: "g" },
      200,
    ]);
  });

  it("uses both halves the shopper typed", async () => {
    const { result } = ghosts();

    await act(() => result.current.add("carotte", "relist", "pcs", 3));

    expect(stock.calls[0]).toMatchObject(["relist", { ingredientId: CARROT, unit: "pcs" }, 3]);
  });

  it("mints nothing for a word that is only whitespace", async () => {
    const { result } = ghosts();

    await act(() => result.current.add("   ", "relist", null, null));

    expect(result.current.pending).toHaveLength(0);
    expect(resolveAction).not.toHaveBeenCalled();
  });
});
