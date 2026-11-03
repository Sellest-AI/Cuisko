import { describe, expect, it } from "vitest";

import {
  ALPHABETICAL_ORDERING_DELAY_MS,
  buildSections,
  type GroceryLine,
  type PendingIngredient,
  type Plate,
  type Snapshot,
  type StockRef,
} from "../model";
import type { ProductRow } from "../products";
import { groupToBuy, isSort, recipeFor, SORTS, toBuyEntries, type Sort, type ToBuyEntry } from "../sort";

const NOW = new Date("2026-08-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const DAY = 86_400_000;
const day = (offset: number) => new Date(NOW.getTime() + offset * DAY);

const PARMESAN = { ingredientId: "parmesan", unit: "g" } as const;
const CARROTS = { ingredientId: "carrots", unit: "pcs" } as const;

/** Settled by default: past the delay by a margin, so retuning the delay does not unsettle the fixture. */
const line = (id: string, ref: StockRef, amount: number, age = ALPHABETICAL_ORDERING_DELAY_MS + 1_000): GroceryLine =>
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
    { id: "friday", recipeId: "lasagna", title: "Lasagnes", date: day(4), slot: "lunch", claims: [{ lineId: "l-parmesan", amount: 100 }] },
    { id: "monday", recipeId: "lasagna", title: "Lasagnes", date: day(0), slot: "dinner", claims: [{ lineId: "l-parmesan", amount: 200 }] },
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

  it("takes what was already bought off the soonest plate first", () => {
    /** 300 g claimed, 250 g still to buy: the 50 g bought comes off Monday, and Friday stands. */
    const snapshot = { ...base, lines: [line("l-parmesan", PARMESAN, 250), line("l-carrots", CARROTS, 4)] };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot))).toEqual([
      ["plate:monday", [["parmesan:g", 150]]],
      ["plate:friday", [["plate:friday:parmesan:g", 100]]],
      ["unplanned", [["carrots:pcs", 4]]],
    ]);
  });

  /**
   * The shopper buys Monday's 200 g off the list: Monday is done, Friday still needs its 100 g.
   * Handing the row out soonest-first left Monday asking for everything and dropped Friday instead.
   */
  it("clears the soonest plate once its share is bought, and a plate with nothing on the list", () => {
    const snapshot = {
      ...base,
      lines: [line("l-parmesan", PARMESAN, 100)],
      plates: [...base.plates, { id: "sunday", recipeId: "soup", title: "Soupe", date: day(6), slot: "lunch" as const, claims: [] }],
    };

    expect(outline(groupToBuy(toBuyOf(snapshot), "by-plan", snapshot))).toEqual([
      ["plate:friday", [["parmesan:g", 100]]],
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

  it("carries the plate, its title, day and slot on the heading, and none of that on unplanned", () => {
    const [monday, , unplanned] = groupToBuy(toBuyOf(base), "by-plan", base);

    // Both plates are the same lasagna: only `mealId` says which one a long press should open.
    expect(monday!.heading).toEqual({ kind: "plate", mealId: "monday", recipeId: "lasagna", title: "Lasagnes", date: day(0), slot: "dinner" });
    expect(unplanned!.heading).toEqual({ kind: "unplanned" });
  });
});

describe("the recipe a card is on the list for", () => {
  /** Two different dishes this time, so the answer says which one it picked. */
  const snapshot: Snapshot = {
    ...base,
    plates: [
      { ...base.plates[0]!, recipeId: "gratin", title: "Gratin" },
      base.plates[1]!,
    ],
  };
  const rowOf = (from: Snapshot, ingredientId: string) =>
    toBuyOf(from).find((stock) => stock.ingredientId === ingredientId)!;

  it("answers for the soonest plate still asking, when the card is the merged row", () => {
    expect(recipeFor(rowOf(snapshot, "parmesan"), null, snapshot)).toBe("lasagna");
  });

  it("skips a plate whose share was already bought", () => {
    /** 200 g bought: Monday's claim is covered, and Friday is why 100 g is still on the list. */
    const bought = { ...snapshot, lines: [line("l-parmesan", PARMESAN, 100), base.lines[1]!] };

    expect(recipeFor(rowOf(bought, "parmesan"), { kind: "category", category: "DAIRY" }, bought)).toBe("gratin");
  });

  it("answers for nobody when the shopper typed it themselves", () => {
    expect(recipeFor(rowOf(snapshot, "carrots"), null, snapshot)).toBeNull();
  });

  it("follows the heading the card sits under, in the by-plan view", () => {
    /** 50 g beyond the plates' claims, so there is an unplanned copy of the row too. */
    const extra = { ...snapshot, lines: [line("l-parmesan", PARMESAN, 350)] };
    const groups = groupToBuy(toBuyOf(extra), "by-plan", extra);
    const friday = groups.find((group) => group.id === "plate:friday")!;
    const unplanned = groups.find((group) => group.id === "unplanned")!;

    expect(recipeFor(friday.rows[0]!, friday.heading, extra)).toBe("gratin");
    expect(recipeFor(unplanned.rows[0]!, unplanned.heading, extra)).toBeNull();
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

describe("toBuyEntries", () => {
  const SETTLED = ALPHABETICAL_ORDERING_DELAY_MS + 1_000;

  const product = (name: string, age = SETTLED): ProductRow =>
    ({ id: name, name, emoji: "📦", amount: 1, unit: "pcs", updatedAt: ago(age) });

  const GHOST: PendingIngredient = { id: "ghost", name: "yuzu", intent: "relist", state: "resolving" };

  /** Each entry as one readable word: a heading is `#kind`, with `^` when it opens the section. */
  const read = (entry: ToBuyEntry) => {
    if (entry.kind === "subheader") return `#${entry.heading.kind}${entry.first ? "^" : ""}`;
    if (entry.kind === "item") return entry.stock.name;
    if (entry.kind === "ghost") return entry.ghost.name;

    return entry.product.name;
  };

  const layout = (
    sort: Sort,
    { snapshot = base, products = [], ghosts = [] }: { snapshot?: Snapshot; products?: ProductRow[]; ghosts?: PendingIngredient[] },
  ) =>
    toBuyEntries({ groups: groupToBuy(toBuyOf(snapshot), sort, snapshot), ghosts, products, sort, now: NOW }).map(read);

  const NO_FOOD: Snapshot = { ...base, lines: [], plates: [] };

  describe("the plain list", () => {
    it("mixes a settled product into the food by name, with no heading", () => {
      expect(layout("standard", { products: [product("Detergent")] })).toEqual(["Carottes", "Detergent", "Parmesan"]);
    });

    it("puts a product typed just now ahead of the settled food", () => {
      expect(layout("standard", { products: [product("Zinc", 1_000)] })).toEqual(["Zinc", "Carottes", "Parmesan"]);
    });

    it("keeps ghosts in front of the mixed rows", () => {
      expect(layout("standard", { products: [product("Detergent")], ghosts: [GHOST] })).toEqual([
        "yuzu",
        "Carottes",
        "Detergent",
        "Parmesan",
      ]);
    });

    it("draws products alone with no heading when there is no food", () => {
      expect(layout("standard", { snapshot: NO_FOOD, products: [product("Soap"), product("Detergent")] })).toEqual([
        "Detergent",
        "Soap",
      ]);
    });
  });

  describe.each(["by-plan", "by-category"] as const)("%s", (sort) => {
    it("opens on the products' heading, above every food heading", () => {
      const entries = layout(sort, { products: [product("Soap"), product("Detergent")] });

      expect(entries.slice(0, 3)).toEqual(["#products^", "Detergent", "Soap"]);
      expect(entries.slice(3).filter((entry) => entry.endsWith("^"))).toEqual([]);
    });

    it("leaves ghosts on the first food group, never under the products' heading", () => {
      const entries = layout(sort, { products: [product("Detergent")], ghosts: [GHOST] });

      expect(entries.slice(0, 3)).toEqual(["#products^", "Detergent", expect.stringMatching(/^#/)]);
      expect(entries[3]).toBe("yuzu");
    });

    /** Under that heading a ghost would read as non-food, and nobody has read the word yet. */
    it("draws ghosts first when there is no food for them to lead", () => {
      expect(layout(sort, { snapshot: NO_FOOD, products: [product("Detergent")], ghosts: [GHOST] })).toEqual([
        "yuzu",
        "#products",
        "Detergent",
      ]);
    });

    it("draws no products' heading with no product", () => {
      expect(layout(sort, { ghosts: [GHOST] })).not.toContain("#products");
    });

    it("draws ghosts alone, with no heading over them, when nothing else is there", () => {
      expect(layout(sort, { snapshot: NO_FOOD, ghosts: [GHOST] })).toEqual(["yuzu"]);
    });
  });

  it("reads by plan as products, then the plates soonest first, then what no plate asked for", () => {
    expect(layout("by-plan", { products: [product("Detergent")] })).toEqual([
      "#products^",
      "Detergent",
      "#plate",
      "Parmesan",
      "#plate",
      "Parmesan",
      "#unplanned",
      "Carottes",
    ]);
  });

  it("reads by aisle as products, then the aisles", () => {
    const entries = layout("by-category", { products: [product("Detergent")] });

    expect(entries.slice(0, 2)).toEqual(["#products^", "Detergent"]);
    expect(entries.filter((entry) => entry === "#category")).toHaveLength(2);
  });

  describe("with no product, today's order", () => {
    it("reads the plain list as ghosts, then the food in its order", () => {
      expect(layout("standard", { ghosts: [GHOST] })).toEqual(["yuzu", "Carottes", "Parmesan"]);
    });

    it("reads by plan with the first heading opening the section and the ghosts under it", () => {
      expect(layout("by-plan", { ghosts: [GHOST] })).toEqual([
        "#plate^",
        "yuzu",
        "Parmesan",
        "#plate",
        "Parmesan",
        "#unplanned",
        "Carottes",
      ]);
    });

    it("does not re-sort the food, whatever clock it is handed", () => {
      const groups = groupToBuy(toBuyOf(base), "standard", base);
      const entries = toBuyEntries({ groups, ghosts: [], products: [], sort: "standard", now: ago(1_000_000_000) });

      expect(entries.map(read)).toEqual(["Carottes", "Parmesan"]);
    });
  });

  it("is nothing at all when nothing is to buy", () => {
    expect(layout("standard", { snapshot: NO_FOOD })).toEqual([]);
    expect(layout("by-plan", { snapshot: NO_FOOD })).toEqual([]);
  });

  it("carries the group's heading on an item, for the long press", () => {
    const groups = groupToBuy(toBuyOf(base), "by-plan", base);
    const entries = toBuyEntries({ groups, ghosts: [], products: [], sort: "by-plan", now: NOW });
    const item = entries.find((entry) => entry.kind === "item");

    expect(item).toMatchObject({ heading: { kind: "plate" } });
  });
});
