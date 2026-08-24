import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { describe, expect, it } from "vitest";

import { useGroceryList } from "./useGroceryList";
import type { StockRow } from "../_model/model";

/**
 * The seam `_model/model.test.ts` cannot reach.
 *
 * Those tests prove `buildSections` and `putInCellar` decide correctly, given sets handed to them.
 * They say nothing about whether this hook wires the two together — that the write reaches the
 * atoms the read subscribes to, and that a tap therefore changes what the screen draws. That is a
 * store question, so it needs a store.
 *
 * `Provider` with no `store` mints a fresh one per render, so each test starts from the seeded
 * placeholder sets rather than from whatever the previous test left behind.
 */
const listOf = () => renderHook(() => useGroceryList(), { wrapper: Provider });

const rowIn = (rows: StockRow[], id: string): StockRow => {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`No row "${id}". Present: ${rows.map((r) => r.id).join(", ")}`);

  return row;
};

describe("useGroceryList", () => {
  it("asks for the gap, not the claim", () => {
    const { result } = listOf();

    // Six carrots are wanted across two plates and two are already in the cellar. A list that
    // showed the claim would send the shopper for six.
    expect(rowIn(result.current.sections["to-buy"], "carrots:pcs").amount).toBe(4);
  });

  it("moves an ingredient off the list and into the cellar when the gap is bought", () => {
    const { result } = listOf();
    const carrots = rowIn(result.current.sections["to-buy"], "carrots:pcs");

    act(() => result.current.submit(carrots, 4));

    expect(result.current.sections["to-buy"].some((row) => row.id === "carrots:pcs")).toBe(false);
    expect(rowIn(result.current.sections.cellar, "carrots:pcs").amount).toBe(6);
  });

  it("counts both taps when two land before a re-render", () => {
    const { result } = listOf();
    const carrots = rowIn(result.current.sections["to-buy"], "carrots:pcs");

    // Deliberately reusing the row captured before the first tap — this is what a real double-tap
    // hands the hook, because React has not re-rendered in between. The write atoms in atoms.ts
    // exist for exactly this: they `get` at write time, so the second tap builds on the first.
    // Three plain `set` calls would compute both from the same starting cellar, and the second
    // would silently overwrite the first — leaving 4, not 6.
    act(() => {
      result.current.submit(carrots, 2);
      result.current.submit(carrots, 2);
    });

    expect(rowIn(result.current.sections.cellar, "carrots:pcs").amount).toBe(6);
  });

  it("offers a purchase back as an undo while its receipt is live", () => {
    const { result } = listOf();
    const carrots = rowIn(result.current.sections["to-buy"], "carrots:pcs");

    act(() => result.current.submit(carrots, 4));

    expect(rowIn(result.current.sections.cellar, "carrots:pcs").undoable).toBe(true);
  });
});
