import { describe, expect, it } from "vitest";

import { buildSections, type GroceryLine, type Plate, type Snapshot, type StockRef } from "../model";
import { groupToBuy, isSort, SORTS } from "../sort";

const NOW = new Date("2026-08-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const DAY = 86_400_000;
const day = (offset: number) => new Date(NOW.getTime() + offset * DAY);

const PARMESAN = { ingredientId: "parmesan", unit: "g" } as const;
const CARROTS = { ingredientId: "carrots", unit: "pcs" } as const;

const line = (id: string, ref: StockRef, amount: number, age = 60_000): GroceryLine =>
  ({ id, ...ref, amount, createdAt: ago(age), updatedAt: ago(age) });

/**
 * The scenario the by-plan view exists for: lasagna twice this week, sharing one merged parmesan
 * row, plus carrots the shopper typed themselves.
 */
const base: Snapshot = {
  ingredients: [
    { id: "parmesan", name: "Parmesan", emoji: "🧀", category: "DAIRY" },
    { id: "carrots", name: "Carottes", emoji: "🥕", category: "VEGETABLE" },
  ],
  lines: [line("l-parmesan", PARMESAN, 300), line("l-carrots", CARROTS, 4)],
  cellar: [],
  receipts: [],
  history: [],
  plates: [
    { id: "friday", title: "Lasagnes", date: day(4), slot: "lunch", claims: [{ lineId: "l-parmesan", amount: 100 }] },
    { id: "monday", title: "Lasagnes", date: day(0), slot: "dinner", claims: [{ lineId: "l-parmesan", amount: 200 }] },
  ],
  now: NOW,
};

const toBuyOf = (snapshot: Snapshot) => buildSections(snapshot)["to-buy"];

/** `[group id, [row id, amount][]]` — the whole shape a test cares about, readable at a glance. */
const outline = (groups: ReturnType<typeof groupToBuy>) =>
  groups.map((group) => [group.id, group.rows.map((row) => [row.id, row.amount])]);

describe("the sort vocabulary", () => {
  it("is closed, and a route param is only a sort if it is in it", () => {
    expect(SORTS).toEqual(["standard", "by-category", "by-plan"]);
    expect(isSort("by-plan")).toBe(true);
    expect(isSort("by-recipe")).toBe(false);
  });
});

describe("standard", () => {
  it("is the one plain group, merged and ordered as the section already is", () => {
    /** Both rows have settled, so the section reads alphabetically — and the group keeps that. */
    expect(outline(groupToBuy(toBuyOf(base), "standard", base))).toEqual([
      ["to-buy", [["carrots:pcs", 4], ["parmesan:g", 300]]],
    ]);
    expect(groupToBuy(toBuyOf(base), "standard", base)[0]!.heading).toBeNull();
  });

  it("is no group at all when nothing is to buy, so no heading is drawn over nothing", () => {
    const empty = { ...base, lines: [], plates: [] };

    expect(groupToBuy(toBuyOf(empty), "standard", empty)).toEqual([]);
    expect(groupToBuy(toBuyOf(empty), "by-plan", empty)).toEqual([]);
    expect(groupToBuy(toBuyOf(empty), "by-category", empty)).toEqual([]);
  });
});

describe("by plan", () => {
  it("orders plates by cook time and gives each its own share of a shared row, one recipe or not", () => {
    expect(outline(groupToBuy(toBuyOf(base), "by-plan", base))).toEqual([
      ["plate:monday", [["parmesan:g", 200]]],
      ["plate:friday", [["plate:friday:parmesan:g", 100]]],
      ["unplanned", [["carrots:pcs", 4]]],
    ]);
  });

  it("breaks a same-day tie by slot, lunch before dinner", () => {
    const plates: Plate[] = [
      { ...base.plates[1]!, id: "monday-dinner", slot: "dinner" },
      { ...base.plates[0]!, id: "monday-lunch", date: day(0), slot: "lunch" },
    ];
    const snapshot = { ...base, plates };

    expect(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot).map((group) => group.id))
      .toEqual(["plate:monday-lunch", "plate:monday-dinner", "unplanned"]);
  });

  it("takes what the cellar already covers off the soonest plate first", () => {
    /** 300 g claimed, 250 g still to buy: Monday's 200 g stands, Friday is left 50 g. */
    const snapshot = { ...base, lines: [line("l-parmesan", PARMESAN, 250), line("l-carrots", CARROTS, 4)] };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot))).toEqual([
      ["plate:monday", [["parmesan:g", 200]]],
      ["plate:friday", [["plate:friday:parmesan:g", 50]]],
      ["unplanned", [["carrots:pcs", 4]]],
    ]);
  });

  it("drops a plate whose share is drained to nothing, and a plate with nothing on the list", () => {
    const snapshot = {
      ...base,
      lines: [line("l-parmesan", PARMESAN, 150)],
      plates: [...base.plates, { id: "sunday", title: "Soupe", date: day(6), slot: "lunch" as const, claims: [] }],
    };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot))).toEqual([
      ["plate:monday", [["parmesan:g", 150]]],
    ]);
  });

  it("puts what the shopper added on top of a plate's claim under unplanned, scoped so the keys stay unique", () => {
    /** The plates claim 300 g; the row holds 350 g, so 50 g is the shopper's own. */
    const snapshot = { ...base, lines: [line("l-parmesan", PARMESAN, 350)] };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot))).toEqual([
      ["plate:monday", [["parmesan:g", 200]]],
      ["plate:friday", [["plate:friday:parmesan:g", 100]]],
      ["unplanned", [["unplanned:parmesan:g", 50]]],
    ]);
  });

  /**
   * The row is the sum of two converted claims, so it carries a float's worth of noise above them.
   * Drained against 0 that noise became a card reading "0 g" under "Not planned".
   */
  it("does not draw float noise as something the shopper asked for", () => {
    const snapshot = {
      ...base,
      lines: [line("l-parmesan", PARMESAN, 0.1 + 0.2)],
      plates: [
        { ...base.plates[1]!, claims: [{ lineId: "l-parmesan", amount: 0.1 }] },
        { ...base.plates[0]!, claims: [{ lineId: "l-parmesan", amount: 0.2 }] },
      ],
    };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot))).toEqual([
      ["plate:monday", [["parmesan:g", 0.1]]],
      ["plate:friday", [["plate:friday:parmesan:g", 0.2]]],
    ]);
  });

  it("carries the plate's title, day and slot on the heading, and none of that on unplanned", () => {
    const [monday, , unplanned] = groupToBuy(toBuyOf(base), "by-plan", base);

    expect(monday!.heading).toEqual({ kind: "plate", title: "Lasagnes", date: day(0), slot: "dinner" });
    expect(unplanned!.heading).toEqual({ kind: "unplanned" });
  });
});

describe("by category", () => {
  it("follows the catalog's aisle order and drops the empty aisles", () => {
    const groups = groupToBuy(toBuyOf(base), "by-category", base);

    expect(outline(groups)).toEqual([
      ["category:VEGETABLE", [["carrots:pcs", 4]]],
      ["category:DAIRY", [["parmesan:g", 300]]],
    ]);
    expect(groups[0]!.heading).toEqual({ kind: "category", category: "VEGETABLE" });
  });

  it("keeps the section's own order inside an aisle rather than re-sorting it", () => {
    const snapshot: Snapshot = {
      ...base,
      ingredients: [...base.ingredients, { id: "leeks", name: "Poireaux", emoji: "🥬", category: "VEGETABLE" }],
      /** Leeks were touched a second ago, so recency puts them ahead of the older carrots. */
      lines: [line("l-carrots", CARROTS, 4), line("l-leeks", { ingredientId: "leeks", unit: "pcs" }, 2, 1_000)],
      plates: [],
    };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-category", snapshot))).toEqual([
      ["category:VEGETABLE", [["leeks:pcs", 2], ["carrots:pcs", 4]]],
    ]);
  });
});
