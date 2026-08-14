import { describe, expect, it } from "vitest";

import {
  adjustCellar,
  buildSections,
  dropMealLines,
  peelReceipts,
  reduceLines,
  rememberStock,
  stockFor,
  UNDO_WINDOW_MS,
  type GroceryLine,
  type Receipt,
  type Snapshot,
} from "./model";

const NOW = new Date("2026-08-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const CARROTS = { ingredientId: "carrots", unit: "pcs" } as const;

/**
 * The scenario the whole model exists for: six carrots are wanted across two plates, one is
 * already owned, so five are missing.
 */
const base: Snapshot = {
  ingredients: [{ id: "carrots", name: "Carottes", emoji: "🥕" }],
  lines: [
    { id: "l1", ...CARROTS, meal: { id: "2026-01-06:dinner", title: "Ratatouille" }, amount: 2, createdAt: ago(60_000) },
    { id: "l2", ...CARROTS, meal: { id: "2026-01-07:lunch", title: "Soupe" }, amount: 4, createdAt: ago(60_000) },
  ],
  cellar: [{ id: "c1", ...CARROTS, amount: 1, updatedAt: ago(60_000) }],
  receipts: [],
  history: [],
  now: NOW,
};

const bought = (amount: number, at: Date): Receipt => ({ id: `r-${at.getTime()}-${amount}`, ...CARROTS, amount, at });

const owning = (amount: number, receipts: Receipt[] = []): Snapshot => ({
  ...base,
  cellar: [{ ...base.cellar[0]!, amount }],
  receipts,
});

const carrots = (snapshot: Snapshot) => stockFor(snapshot, CARROTS);
const amountsIn = (snapshot: Snapshot) => {
  const sections = buildSections(snapshot);

  return {
    toBuy: sections["to-buy"].map((row) => row.amount),
    cellar: sections.cellar.map((row) => row.amount),
    remembered: sections["recently-bought"].map((row) => row.amount),
  };
};

describe("the gap between what is wanted and what is owned", () => {
  it("asks only for what is missing", () => {
    expect(carrots(base)).toMatchObject({ needed: 6, owned: 1, toBuy: 5 });
  });

  it("closes once the missing amount is bought", () => {
    expect(amountsIn(owning(6, [bought(5, ago(1_000))]))).toEqual({
      toBuy: [],
      cellar: [6],
      remembered: [],
    });
  });

  it("keeps the remainder on the list after a partial purchase", () => {
    expect(amountsIn(owning(4, [bought(3, ago(1_000))]))).toEqual({
      toBuy: [2],
      cellar: [4],
      remembered: [],
    });
  });
});

describe("a cellar row inside the undo window", () => {
  it("is marked undoable, and only while the receipt is live", () => {
    const live = buildSections(owning(7, [bought(6, ago(1_000))]));
    const expired = buildSections(owning(7, [bought(6, ago(UNDO_WINDOW_MS + 1_000))]));

    expect(live.cellar[0]?.undoable).toBe(true);
    expect(expired.cellar[0]?.undoable).toBe(false);
  });

  it("offers the last purchase back rather than everything owned", () => {
    /** Seven owned: one from last week, six from a moment ago. Only the six are a mistap. */
    expect(carrots(owning(7, [bought(6, ago(1_000))]))).toMatchObject({
      owned: 7,
      live: 6,
      lastPurchase: expect.objectContaining({ amount: 6 }),
    });
  });
});

describe("what is neither owned nor wanted", () => {
  it("falls into memory rather than back onto the list", () => {
    const cooked: Snapshot = { ...base, lines: [], cellar: [], history: [{ id: "h1", ...CARROTS, amount: 6, at: ago(1_000) }] };

    expect(amountsIn(cooked)).toEqual({ toBuy: [], cellar: [], remembered: [6] });
  });

  it("leaves memory the moment any of it is wanted again", () => {
    const relisted: Snapshot = {
      ...base,
      lines: [{ id: "manual", ...CARROTS, amount: 6, createdAt: ago(1_000) }],
      cellar: [],
      history: [{ id: "h1", ...CARROTS, amount: 6, at: ago(2_000) }],
    };

    expect(amountsIn(relisted)).toEqual({ toBuy: [6], cellar: [], remembered: [] });
  });

  it("never appears for an ingredient that was never bought", () => {
    expect(amountsIn({ ...base, lines: [], cellar: [] })).toEqual({ toBuy: [], cellar: [], remembered: [] });
  });
});

describe("rows that need no sheet", () => {
  /** Nothing wanted, so the row is a plain cellar row and the only question is how much. */
  const owningOnly = (amount: number): Snapshot => ({
    ...base,
    lines: [],
    cellar: [{ ...base.cellar[0]!, amount }],
  });

  it("resolves a cellar row that can only move one way", () => {
    const [row] = buildSections(owningOnly(1)).cellar;

    expect(row?.onlyOption).toBe(1);
  });

  it("still asks when a smaller amount is possible", () => {
    const [row] = buildSections(owningOnly(2)).cellar;

    expect(row?.onlyOption).toBeNull();
  });

  it("never resolves a purchase, which has no ceiling to run out of", () => {
    const [row] = buildSections(base)["to-buy"];

    expect(row).toMatchObject({ intent: "buy", onlyOption: null });
  });

  it("carries the intent of the section it sits in", () => {
    /** Five missing and one owned, so carrots hold a row in both sections at once. */
    const sections = buildSections(base);

    expect(sections["to-buy"][0]?.intent).toBe("buy");
    expect(sections.cellar[0]?.intent).toBe("remove");
  });
});

describe("writing to a set", () => {
  /** Two rows sharing an id, which is what a counted id generator produces against seeded data. */
  const collided = [
    { id: "cellar-1", ingredientId: "carrots", unit: "pcs", amount: 1, updatedAt: ago(60_000) },
    { id: "cellar-1", ingredientId: "garlic", unit: "pcs", amount: 1, updatedAt: ago(1_000) },
  ] as const;

  it("touches only the row it was aimed at, whatever the ids say", () => {
    const after = adjustCellar([...collided], {
      ref: { ingredientId: "garlic", unit: "pcs" },
      delta: -1,
      now: NOW,
      id: "unused",
    });

    expect(after.map((entry) => [entry.ingredientId, entry.amount])).toEqual([
      ["carrots", 1],
      ["garlic", 0],
    ]);
  });

  it("keeps the same guarantee for the memory", () => {
    const after = rememberStock(
      [
        { id: "history-1", ingredientId: "pasta", unit: "g", amount: 500, at: ago(60_000) },
        { id: "history-1", ingredientId: "butter", unit: "g", amount: 250, at: ago(60_000) },
      ],
      { ref: { ingredientId: "butter", unit: "g" }, amount: 125, at: NOW, id: "unused", overwriteAmount: true },
    );

    expect(after.map((entry) => [entry.ingredientId, entry.amount])).toEqual([
      ["pasta", 500],
      ["butter", 125],
    ]);
  });

  it("creates a row when the household has never owned this before", () => {
    const ref = { ingredientId: "garlic", unit: "pcs" } as const;
    const after = adjustCellar([], { ref, delta: 1, now: NOW, id: "fresh" });

    expect(after).toEqual([{ id: "fresh", ...ref, amount: 1, updatedAt: NOW }]);
  });
});

describe("row identity across a change of section", () => {
  it("carries the same key from the list into the cellar", () => {
    const listed = buildSections({ ...base, cellar: [] })["to-buy"][0];
    const stocked = buildSections({ ...base, lines: [], cellar: [{ ...base.cellar[0]!, amount: 6 }] }).cellar[0];

    expect(listed?.id).toBe("carrots:pcs");
    expect(stocked?.id).toBe(listed?.id);
  });

  it("scopes only the leftover row when an ingredient holds two", () => {
    const sections = buildSections(base);

    expect(sections["to-buy"][0]?.id).toBe("carrots:pcs");
    expect(sections.cellar[0]?.id).toBe("cellar:carrots:pcs");
  });

  it("keeps the key when the last of it falls into memory", () => {
    const remembered = buildSections({
      ...base,
      lines: [],
      cellar: [],
      history: [{ id: "h1", ...CARROTS, amount: 6, at: ago(1_000) }],
    })["recently-bought"][0];

    expect(remembered?.id).toBe("carrots:pcs");
  });
});

describe("peeling receipts", () => {
  it("takes the whole purchase back", () => {
    expect(peelReceipts([bought(6, ago(1_000))], CARROTS, 6, NOW)).toEqual([]);
  });

  it("takes from the newest purchase first", () => {
    const older = bought(6, ago(120_000));
    const newer = bought(2, ago(1_000));

    expect(peelReceipts([older, newer], CARROTS, 2, NOW)).toEqual([older]);
  });

  it("stops at the live edge rather than reaching into settled stock", () => {
    const expired = bought(6, ago(UNDO_WINDOW_MS + 1_000));
    const live = bought(2, ago(1_000));

    expect(peelReceipts([expired, live], CARROTS, 5, NOW)).toEqual([expired]);
  });

  it("leaves the rest of a partially undone purchase in place", () => {
    expect(peelReceipts([bought(6, ago(1_000))], CARROTS, 2, NOW).map((r) => r.amount)).toEqual([4]);
  });
});

describe("dropping a plate's claims", () => {
  const lines: GroceryLine[] = base.lines;

  it("takes only what that plate asked for", () => {
    expect(dropMealLines(lines, "2026-01-06:dinner").map((line) => line.id)).toEqual(["l2"]);
  });

  /** The reason lines key on the plate and not the dish: one swap must not empty the other day. */
  it("leaves another plate serving the same dish untouched", () => {
    const twice: GroceryLine[] = [
      { id: "mon", ...CARROTS, meal: { id: "2026-01-06:dinner", title: "Soupe" }, amount: 2, createdAt: NOW },
      { id: "fri", ...CARROTS, meal: { id: "2026-01-10:dinner", title: "Soupe" }, amount: 2, createdAt: NOW },
    ];

    expect(dropMealLines(twice, "2026-01-06:dinner").map((line) => line.id)).toEqual(["fri"]);
  });

  it("never touches a line the shopper added themselves", () => {
    const byHand: GroceryLine[] = [{ id: "own", ...CARROTS, amount: 2, createdAt: NOW }];

    expect(dropMealLines(byHand, "2026-01-06:dinner")).toEqual(byHand);
  });
});

describe("discharging claims", () => {
  const lines: GroceryLine[] = base.lines;

  it("settles the oldest claim first", () => {
    expect(reduceLines(lines, CARROTS, 2).map((line) => line.id)).toEqual(["l2"]);
  });

  it("carries over into the next claim", () => {
    expect(reduceLines(lines, CARROTS, 3).map((line) => line.amount)).toEqual([3]);
  });

  it("clears every claim when everything is used", () => {
    expect(reduceLines(lines, CARROTS, 6)).toEqual([]);
  });

  it("leaves other ingredients alone", () => {
    expect(reduceLines(lines, { ingredientId: "onions", unit: "g" }, 500)).toEqual(lines);
  });
});
