import { describe, expect, it } from "vitest";

import {
  ALPHABETICAL_ORDERING_DELAY_MS,
  adjustCellar,
  buildSections,
  dropIngredientLines,
  dropMealLines,
  orderSections,
  peelReceipts,
  putInCellar,
  quantityOptions,
  reduceLines,
  rememberStock,
  rowsOf,
  sectionFromParam,
  stockFor,
  takeFromCellar,
  UNDO_WINDOW_MS,
  type CellarEntry,
  type GroceryLine,
  type HistoryEntry,
  type PendingIngredient,
  type PendingIntent,
  type Receipt,
  type Section,
  type Snapshot,
} from "../model";

const NOW = new Date("2026-08-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/** Old enough to have settled into alphabetical order, by a margin, whatever the delay is tuned to. */
const SETTLED = ALPHABETICAL_ORDERING_DELAY_MS + 1_000;

const CARROTS = { ingredientId: "carrots", unit: "pcs" } as const;

/**
 * The scenario the whole model exists for: six carrots are wanted across two plates, one is
 * already owned, so five are missing.
 */
const base: Snapshot = {
  ingredients: [{ id: "carrots", name: "Carottes", emoji: "🥕", category: "VEGETABLE" }],
  lines: [
    { id: "l1", ...CARROTS, meal: { id: "2026-01-06:dinner", title: "Ratatouille" }, amount: 2, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) },
    { id: "l2", ...CARROTS, meal: { id: "2026-01-07:lunch", title: "Soupe" }, amount: 4, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) },
  ],
  cellar: [{ id: "c1", ...CARROTS, amount: 1, updatedAt: ago(SETTLED) }],
  receipts: [],
  history: [],
  plates: [],
  now: NOW,
};

/**
 * A purchase with no plate waiting on it, unless a caller says otherwise: whatever did not settle
 * an own line is surplus, so the gap band is empty. That is the shape of nearly every fixture here.
 */
const bought = (amount: number, at: Date, settled = 0, surplus = amount - settled): Receipt => ({
  id: `r-${at.getTime()}-${amount}`,
  ...CARROTS,
  amount,
  at,
  settled,
  surplus,
});

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
    expect(carrots(base)).toMatchObject({ claimed: 6, wanted: 0, owned: 1, toBuy: 5 });
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

describe("asking for something outright", () => {
  /** `base` holds one carrot in the cellar, so a netted line of 1 would show nothing. */
  const asking = (amount: number, lines = base.lines) => ({
    ...base,
    lines: [...lines, { id: "own", ...CARROTS, amount, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) }],
  });

  it("is not netted against the cellar", () => {
    expect(carrots(asking(1, []))).toMatchObject({ claimed: 0, wanted: 1, owned: 1, toBuy: 1 });
  });

  it("adds to whatever the plates are short of", () => {
    expect(carrots(asking(2))).toMatchObject({ claimed: 6, wanted: 2, owned: 1, toBuy: 7 });
  });

  it("shows on the list rather than disappearing into the cellar", () => {
    expect(amountsIn(asking(1, []))).toEqual({ toBuy: [1], cellar: [1], remembered: [] });
  });
});

describe("stock arriving", () => {
  const ids = { cellarId: "c", receiptId: "r", historyId: "h" };
  const arriving = (amount: number) => ({ ref: CARROTS, amount, at: NOW, ...ids });

  const sets = (lines: GroceryLine[], owned = 0) => ({
    lines,
    cellar: owned > 0 ? [{ id: "c1", ...CARROTS, amount: owned, updatedAt: ago(SETTLED) }] : [],
    receipts: [],
    history: [],
  });

  const OWN: GroceryLine = { id: "own", ...CARROTS, amount: 2, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) };
  const PLATE: GroceryLine = base.lines[0]!;

  it("moves nothing on a non-amount", () => {
    expect(putInCellar(sets([OWN]), arriving(0))).toBeNull();
  });

  it("strikes off what the shopper asked for, and logs how much it settled", () => {
    const after = putInCellar(sets([OWN]), arriving(2));

    expect(after?.lines).toEqual([]);
    expect(after?.receipts[0]).toMatchObject({ amount: 2, settled: 2 });
  });

  /**
   * The distinction the whole split exists for. A plate's claim is answered by the cellar rising,
   * so buying must not delete it — the line is what the week is still cooking from, and settling
   * it here would leave a dish nothing is shopping for.
   */
  it("never settles a plate's claim", () => {
    const after = putInCellar(sets([PLATE]), arriving(2));

    expect(after?.lines).toEqual([PLATE]);
    expect(after?.receipts[0]).toMatchObject({ settled: 0 });
  });

  it("settles the shopper's own line first and banks the rest", () => {
    const after = putInCellar(sets([PLATE, OWN]), arriving(5));

    expect(after?.lines).toEqual([PLATE]);
    expect(after?.receipts[0]).toMatchObject({ amount: 5, settled: 2 });
    expect(after?.cellar[0]?.amount).toBe(5);
  });

  /**
   * The round trip a stored `settled` exists for. Buying deletes the line, so peeling the receipt
   * has to put it back — otherwise undoing a mistap silently drops what the shopper wrote down.
   */
  it("gives the line back when the purchase is undone", () => {
    const bought = putInCellar(sets([OWN]), arriving(2))!;

    expect(carrots({ ...base, ...bought })).toMatchObject({ wanted: 0, toBuy: 0 });

    const undone = takeFromCellar(bought, {
      ref: CARROTS,
      amount: 2,
      at: NOW,
      historyId: "h2",
      lineId: "back",
    });

    expect(undone?.lines).toEqual([{ id: "back", ...CARROTS, amount: 2, createdAt: NOW, updatedAt: NOW }]);
    expect(carrots({ ...base, ...undone! })).toMatchObject({ wanted: 2, toBuy: 2 });
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
      lines: [{ id: "manual", ...CARROTS, amount: 6, createdAt: ago(1_000), updatedAt: ago(1_000) }],
      cellar: [],
      history: [{ id: "h1", ...CARROTS, amount: 6, at: ago(2_000) }],
    };

    expect(amountsIn(relisted)).toEqual({ toBuy: [6], cellar: [], remembered: [] });
  });

  /**
   * The other half of the same rule, and the reason it is gated on the gap rather than the cellar
   * alone. Asserted as a before/after because the number on its own proves nothing: what the fix
   * changed is that the gap now MOVES when the cellar does. Discharging the claims alongside the
   * stock — which is what `removeFromCellar` used to do — left both sides of this equal.
   */
  it("reopens the gap by what left the cellar", () => {
    const emptied: Snapshot = {
      ...base,
      cellar: [],
      history: [{ id: "h1", ...CARROTS, amount: 1, at: ago(1_000) }],
    };

    expect(amountsIn(base)).toMatchObject({ toBuy: [5], cellar: [1] });
    expect(amountsIn(emptied)).toEqual({ toBuy: [6], cellar: [], remembered: [] });
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

describe("what the sheet offers", () => {
  const flour = { ingredientId: "flour", unit: "g" } as const;
  const owing = (claimed: number, owned: number): Snapshot => ({
    ...base,
    ingredients: [{ id: "flour", name: "Farine", emoji: "🌾", category: "GRAIN" }],
    lines: [{ id: "f1", ...flour, meal: { id: "2026-01-06:dinner", title: "Pain" }, amount: claimed, createdAt: NOW, updatedAt: NOW }],
    cellar: [{ id: "cf", ...flour, amount: owned, updatedAt: NOW }],
  });
  const tiles = (snapshot: Snapshot) => quantityOptions(stockFor(snapshot, flour), "g", "buy").map((option) => option.amount);

  /**
   * The tiles are drawn at the unit's precision, so two amounts that read the same ARE the same to
   * the shopper: a gap of 49.6 g shows as "50 g", and a preset "50 g" beside it would be the same
   * tile twice with only one of them highlighted. Compared exactly, 49.6 and 50 would both survive.
   */
  it("drops a preset that would read the same as the suggestion", () => {
    const [suggested, ...presets] = tiles(owing(149.6, 100));

    expect(suggested).toBeCloseTo(49.6);
    expect(presets).toEqual([100, 150, 200, 250, 300, 400, 500, 750]);
  });

  /** Float noise off a claim is the other way a preset could slip past an exact comparison. */
  it("drops a preset the suggestion differs from only by float noise", () => {
    expect(tiles(owing(150.00000000000003, 100))).toEqual([50.00000000000003, 100, 150, 200, 250, 300, 400, 500, 750]);
  });

  it("keeps a preset the suggestion genuinely differs from", () => {
    expect(tiles(owing(160, 100))).toEqual([60, 50, 100, 150, 200, 250, 300, 400, 500]);
  });

  /** Monday's card under the by-plan view stood for 200 g of a 300 g row: that is what was tapped. */
  it("opens on what the tapped card needed, with the whole row as the next tile", () => {
    const options = quantityOptions(stockFor(owing(300, 0), flour), "g", "buy", 200);

    expect(options.map((option) => option.amount)).toEqual([200, 300, 50, 100, 150, 250, 400, 500, 750]);
    expect(options[0]?.captionKey).toBe("Quantity.Captions.needed");
    expect(options[1]?.captionKey).toBeUndefined();
  });

  it("ignores a needed amount that is the whole row or more, and never applies one to a removal", () => {
    const stock = stockFor(owing(300, 100), flour);

    expect(quantityOptions(stock, "g", "buy", 200)).toEqual(quantityOptions(stock, "g", "buy"));
    expect(quantityOptions(stock, "g", "remove", 50)).toEqual(quantityOptions(stock, "g", "remove"));
  });

  /** A converted claim leaves the row a float's worth above it: two tiles would both read "0.3 g". */
  it("ignores a needed amount below the row only by float noise", () => {
    const stock = stockFor(owing(0.1 + 0.2, 0), flour);

    expect(quantityOptions(stock, "g", "buy", 0.3)).toEqual(quantityOptions(stock, "g", "buy"));
  });
});

describe("writing to a set", () => {
  /** Two rows sharing an id, which is what a counted id generator produces against seeded data. */
  const collided = [
    { id: "cellar-1", ingredientId: "carrots", unit: "pcs", amount: 1, updatedAt: ago(SETTLED) },
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
        { id: "history-1", ingredientId: "pasta", unit: "g", amount: 500, at: ago(SETTLED) },
        { id: "history-1", ingredientId: "butter", unit: "g", amount: 250, at: ago(SETTLED) },
      ],
      { ref: { ingredientId: "butter", unit: "g" }, amount: 125, at: NOW, id: "unused", overwriteAmount: true },
    );

    expect(after.map((entry) => [entry.ingredientId, entry.amount])).toEqual([
      ["pasta", 500],
      ["butter", 125],
    ]);
  });

  /**
   * The branch every removal takes. A purchase is the only thing that may state how much this
   * household buys at a time, so an emptied cellar must not talk over one that already exists —
   * and when none does, the caller's seed stands as the first answer.
   */
  it("leaves a remembered amount alone when the write is not a purchase", () => {
    const ref = { ingredientId: "butter", unit: "g" } as const;
    const existing = [{ id: "history-1", ...ref, amount: 250, at: ago(SETTLED) }];

    expect(
      rememberStock(existing, { ref, amount: 125, at: NOW, id: "unused", overwriteAmount: false }),
    ).toEqual([{ id: "history-1", ...ref, amount: 250, at: NOW }]);

    expect(
      rememberStock([], { ref, amount: 125, at: NOW, id: "seeded", overwriteAmount: false }),
    ).toEqual([{ id: "seeded", ...ref, amount: 125, at: NOW }]);
  });

  it("creates a row when the household has never owned this before", () => {
    const ref = { ingredientId: "garlic", unit: "pcs" } as const;
    const after = adjustCellar([], { ref, delta: 1, now: NOW, id: "fresh" });

    expect(after).toEqual([{ id: "fresh", ...ref, amount: 1, updatedAt: NOW }]);
  });
});

describe("taking stock out of the cellar", () => {
  const held = (amount: number, receipts: Receipt[] = [], lines: GroceryLine[] = []) => ({
    lines,
    cellar: [{ id: "c1", ...CARROTS, amount, updatedAt: ago(SETTLED) }],
    receipts,
    history: [],
  });

  const take = (amount: number) => ({
    ref: CARROTS,
    amount,
    at: NOW,
    historyId: "h",
    lineId: "restored",
  });

  it("moves nothing when the cellar has none of it", () => {
    expect(takeFromCellar(held(0), take(2))).toBeNull();
    expect(takeFromCellar({ lines: [], cellar: [], receipts: [], history: [] }, take(2))).toBeNull();
  });

  it("caps what leaves at what is there", () => {
    const after = takeFromCellar(held(1), take(6));

    expect(after?.cellar[0]?.amount).toBe(0);
  });

  it("remembers what was held, not what left", () => {
    const after = takeFromCellar(held(2), take(1));

    expect(after?.history).toEqual([{ id: "h", ...CARROTS, amount: 2, at: NOW }]);
  });

  /**
   * The quick-tap regression, and the reason this is one function over three sets rather than
   * three writes. Feeding each result into the next is what a write atom's `get` guarantees;
   * computing both from the same starting sets is what the hook used to do, and the second peel
   * then overwrote the first — leaving a live receipt for stock the cellar no longer held.
   */
  it("composes when a second removal lands before anything re-reads", () => {
    const start = held(4, [bought(4, ago(1_000))]);

    const once = takeFromCellar(start, take(2));
    const twice = takeFromCellar(once!, take(2));

    expect(twice?.cellar[0]?.amount).toBe(0);
    expect(twice?.receipts).toEqual([]);

    /** What the bug produced: both peels computed from `start`, so the first one is lost. */
    const raced = takeFromCellar(start, take(2));

    expect(raced?.receipts.map((receipt) => receipt.amount)).toEqual([2]);
  });

  it("keeps a remembered purchase amount across later removals", () => {
    const start = { ...held(4), history: [{ id: "h0", ...CARROTS, amount: 6, at: ago(SETTLED) }] };

    expect(takeFromCellar(start, take(4))?.history[0]?.amount).toBe(6);
  });
});

describe("striking an ingredient off the list", () => {
  const lines: GroceryLine[] = [
    { id: "l1", ...CARROTS, meal: { id: "d1", title: "Ratatouille" }, amount: 2, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) },
    { id: "l2", ...CARROTS, meal: { id: "d2", title: "Soupe" }, amount: 4, createdAt: ago(30_000), updatedAt: ago(30_000) },
    { id: "l3", ingredientId: "onions", unit: "g", amount: 200, createdAt: ago(30_000), updatedAt: ago(30_000) },
  ];

  /** Deliberate and lossy: the point of the gesture is that the list stops asking, full stop. */
  it("takes every claim on it, plates included", () => {
    expect(dropIngredientLines(lines, CARROTS).map((line) => line.id)).toEqual(["l3"]);
  });

  it("leaves a different unit of the same ingredient standing", () => {
    expect(dropIngredientLines(lines, { ingredientId: "carrots", unit: "g" })).toEqual(lines);
  });
});

/**
 * The invariant the sections are actually read against, exercised through the writes rather than
 * through hand-built snapshots. Each case here is one that got past the tests once.
 */
describe("what a purchase does to the list", () => {
  const PLATE = { id: "plate", ...CARROTS, meal: { id: "m", title: "M" }, amount: 8, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) };
  const OWN = { id: "own", ...CARROTS, amount: 3, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) };

  const start = (lines: GroceryLine[], owned = 0) => ({
    lines,
    cellar: owned > 0 ? [{ id: "c1", ...CARROTS, amount: owned, updatedAt: ago(SETTLED) }] : [],
    receipts: [],
    history: [],
  });

  const buy = (sets: ReturnType<typeof start>, amount: number) =>
    putInCellar(sets, { ref: CARROTS, amount, at: NOW, cellarId: "c", receiptId: "r", historyId: "h" })!;

  const listed = (sets: { lines: GroceryLine[]; cellar: CellarEntry[] }) =>
    stockFor({ ...base, ...sets, receipts: [], history: [] }, CARROTS).toBuy;

  /**
   * Buying N takes exactly N off the list, whoever was asking. The plates' share is netted against
   * the cellar and the shopper's own lines are deleted, and for a while both happened to the same
   * units: 8 claimed plus 3 asked outright is a list of 11, and buying 3 took it to 5 — three
   * bought, six gone. Nothing caught it because every test here asserted lines, receipts and cellar
   * one at a time, and never the number the shopper actually reads.
   */
  it.each([
    ["only plates are asking", [PLATE], 0, 3],
    ["only the shopper is asking", [OWN], 0, 2],
    ["both are asking, and the plates are short", [PLATE, OWN], 0, 3],
    ["both are asking, and the plates are covered", [PLATE, OWN], 8, 2],
    ["the purchase overshoots everything", [PLATE, OWN], 0, 11],
  ])("falls by exactly what was bought when %s", (_case, lines, owned, amount) => {
    const before = start(lines, owned);
    const after = buy(before, amount);

    expect(listed(before) - listed(after)).toBe(Math.min(amount, listed(before)));
  });

  it("never lets a purchase reach a plate's claim", () => {
    const after = buy(start([PLATE, OWN]), 11);

    expect(after.lines).toEqual([PLATE]);
  });

  /**
   * The shopper's own line is only settled out of what is left once the plates are covered, so a
   * purchase smaller than their shortfall leaves it standing. It is the same food either way — the
   * carrots in the house will be eaten by the dish that wanted them.
   */
  it("leaves the shopper's line alone while the plates are still short", () => {
    const after = buy(start([PLATE, OWN]), 3);

    expect(after.lines).toEqual([PLATE, OWN]);
    expect(after.receipts[0]).toMatchObject({ amount: 3, settled: 0, surplus: 0 });
  });

  it("splits a purchase across all three bands", () => {
    const after = buy(start([PLATE, OWN]), 13);

    expect(after.receipts[0]).toMatchObject({ amount: 13, settled: 3, surplus: 2 });
  });

  /**
   * Giving stock back has to reopen what it closed. Peeling used to take the settled band as the
   * bottom of the receipt, so handing back three of an eleven-carrot purchase left the cellar
   * exactly covering the plates, restored no line, and lost the shopper's three without trace.
   */
  it("gives the shopper their line back when the stock goes back", () => {
    const after = buy(start([PLATE, OWN]), 11);

    expect(listed(after)).toBe(0);

    const returned = takeFromCellar(after, {
      ref: CARROTS,
      amount: 3,
      at: NOW,
      historyId: "h2",
      lineId: "back",
    })!;

    expect(returned.lines).toContainEqual({ id: "back", ...CARROTS, amount: 3, createdAt: NOW, updatedAt: NOW });
    expect(listed(returned)).toBe(3);
  });

  it("hands surplus back before it touches what the shopper asked for", () => {
    const after = buy(start([OWN]), 5);
    const returned = takeFromCellar(after, {
      ref: CARROTS,
      amount: 2,
      at: NOW,
      historyId: "h2",
      lineId: "back",
    })!;

    expect(returned.lines).toEqual([]);
    expect(listed(returned)).toBe(0);
  });

  /**
   * Restoring a line is the undo, and the undo is what the window is for. Inside it, putting stock
   * back unmakes the purchase and the note comes with it; outside, the purchase stands and taking
   * stock out is the shopper using what they bought.
   */
  it("only gives the line back while the purchase is still undoable", () => {
    const after = buy(start([OWN]), 3);
    const undo = (at: Date) =>
      takeFromCellar(after, { ref: CARROTS, amount: 3, at, historyId: "h2", lineId: "back" })!;

    expect(undo(NOW).lines).toHaveLength(1);
    expect(undo(new Date(NOW.getTime() + UNDO_WINDOW_MS + 1_000)).lines).toHaveLength(0);
  });

  it("peels across two purchases, newest first, and adds up what they settled", () => {
    const one = buy(start([OWN]), 2);
    const two = putInCellar(one, {
      ref: CARROTS,
      amount: 1,
      at: NOW,
      cellarId: "c2",
      receiptId: "r2",
      historyId: "h2",
    })!;

    expect(two.receipts.map((receipt) => receipt.settled)).toEqual([2, 1]);
    expect(peelReceipts(two.receipts, CARROTS, 3, NOW).restored).toBe(3);
  });
});

describe("what the household is remembered as buying", () => {
  const TOMATOES = { ingredientId: "tomatoes", unit: "g" } as const;
  const BY_KILO = { ingredientId: "tomatoes", unit: "kg" } as const;

  const remember = (ref: typeof TOMATOES | typeof BY_KILO, amount: number, bought: boolean) =>
    (entries: HistoryEntry[]) =>
      rememberStock(entries, { ref, amount, at: NOW, id: `h-${ref.unit}`, overwriteAmount: bought });

  it("keeps one row per ingredient, whatever unit it was bought in", () => {
    const after = remember(BY_KILO, 1, true)(remember(TOMATOES, 300, true)([]));

    expect(after).toEqual([{ id: "h-g", ...BY_KILO, amount: 1, at: NOW }]);
  });

  /**
   * The unit rides with the amount or not at all. A removal may not state how much the household
   * buys, so it may not restate the unit either — "1" left over from a kilo, relabelled grams by
   * a handful of tomatoes going out of the cellar, is a number nobody ever bought.
   */
  it("does not let a removal relabel a remembered purchase", () => {
    const bought = remember(BY_KILO, 1, true)([]);
    const after = remember(TOMATOES, 300, false)(bought);

    expect(after).toEqual([{ id: "h-kg", ...BY_KILO, amount: 1, at: NOW }]);
  });

  /** The reason for all of it: two rows drew the same ingredient into memory twice. */
  it("shows the ingredient in memory once", () => {
    const sections = buildSections({
      ingredients: [{ id: "tomatoes", name: "Tomates", emoji: "🍅", category: "VEGETABLE" }],
      lines: [],
      cellar: [],
      receipts: [
        { id: "r1", ...TOMATOES, amount: 300, at: ago(UNDO_WINDOW_MS + 1_000), settled: 0, surplus: 300 },
        { id: "r2", ...BY_KILO, amount: 1, at: ago(UNDO_WINDOW_MS + 1_000), settled: 0, surplus: 1 },
      ],
      history: remember(BY_KILO, 1, true)(remember(TOMATOES, 300, true)([])),
      plates: [],
      now: NOW,
    });

    expect(sections["recently-bought"].map((row) => [row.amount, row.unit])).toEqual([[1, "kg"]]);
  });
});

describe("when a row was last touched", () => {
  /**
   * `touchedAt` seeded its reduce with `snapshot.now`, so it always answered `now` — nothing is
   * ever touched in the future. Every row then shared an age of zero, which quietly retired the
   * recency sort: both branches of the comparison were no-ops and rows came out in whatever order
   * the key walk built them.
   */
  it("reports the newest thing that happened to it, not the clock", () => {
    expect(carrots({ ...base, lines: [], history: [] }).touchedAt).toEqual(ago(SETTLED));
  });

  it("falls back to the clock only when nothing has happened to it at all", () => {
    const untouched: Snapshot = { ...base, lines: [], cellar: [], receipts: [], history: [] };

    expect(stockFor(untouched, CARROTS).touchedAt).toEqual(NOW);
  });

  it("orders the cellar by what was touched most recently", () => {
    const sections = buildSections({
      ingredients: [
        { id: "carrots", name: "Carottes", emoji: "🥕", category: "VEGETABLE" },
        { id: "bread", name: "Pain", emoji: "🥖", category: "GRAIN" },
      ],
      lines: [],
      cellar: [
        { id: "c1", ...CARROTS, amount: 1, updatedAt: ago(SETTLED) },
        { id: "c2", ingredientId: "bread", unit: "pcs", amount: 1, updatedAt: ago(1_000) },
      ],
      receipts: [],
      history: [],
      plates: [],
      now: NOW,
    });

    expect(sections.cellar.map((row) => row.ingredientId)).toEqual(["bread", "carrots"]);
  });

  /**
   * A row just added, or bumped by a fresh quantity, has the smallest age in its section — so it
   * has to sort first, the same place a ghost sits while it is still resolving. Sorting to-buy
   * oldest-first used to send it to the opposite end, so the real row appeared to jump past every
   * other card the moment its ghost resolved.
   *
   * Bread and carrots share a `createdAt` here and differ only in `updatedAt`, so this also pins
   * that the sort reads the touch, not the creation — a merged repeat add moves only the former.
   */
  it("orders to-buy by what was touched most recently", () => {
    const sections = buildSections({
      ingredients: [
        { id: "carrots", name: "Carottes", emoji: "🥕", category: "VEGETABLE" },
        { id: "bread", name: "Pain", emoji: "🥖", category: "GRAIN" },
      ],
      lines: [
        { id: "l1", ...CARROTS, amount: 1, createdAt: ago(SETTLED), updatedAt: ago(SETTLED) },
        { id: "l2", ingredientId: "bread", unit: "pcs", amount: 1, createdAt: ago(SETTLED), updatedAt: ago(1_000) },
      ],
      cellar: [],
      receipts: [],
      history: [],
      plates: [],
      now: NOW,
    });

    expect(sections["to-buy"].map((row) => row.ingredientId)).toEqual(["bread", "carrots"]);
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
    expect(peelReceipts([bought(6, ago(1_000))], CARROTS, 6, NOW).receipts).toEqual([]);
  });

  it("takes from the newest purchase first", () => {
    const older = bought(6, ago(120_000));
    const newer = bought(2, ago(1_000));

    expect(peelReceipts([older, newer], CARROTS, 2, NOW).receipts).toEqual([older]);
  });

  it("stops at the live edge rather than reaching into settled stock", () => {
    const expired = bought(6, ago(UNDO_WINDOW_MS + 1_000));
    const live = bought(2, ago(1_000));

    expect(peelReceipts([expired, live], CARROTS, 5, NOW).receipts).toEqual([expired]);
  });

  /** What the server reports as `purchase undone`: only stock that came off a live receipt. */
  it("counts as undone only what came off a live receipt", () => {
    const expired = bought(6, ago(UNDO_WINDOW_MS + 1_000));
    const live = bought(2, ago(1_000));

    expect(peelReceipts([expired, live], CARROTS, 5, NOW).undone).toBe(2);
    expect(peelReceipts([expired], CARROTS, 5, NOW).undone).toBe(0);
    expect(peelReceipts([live], CARROTS, 1, NOW).undone).toBe(1);
  });

  it("leaves the rest of a partially undone purchase in place", () => {
    expect(peelReceipts([bought(6, ago(1_000))], CARROTS, 2, NOW).receipts.map((r) => r.amount))
      .toEqual([4]);
  });

  /**
   * The settled units sit at the bottom of the receipt, so peeling eats the extras first. Six
   * bought against a list asking for two: giving four back leaves the list clear, because the
   * four returned were never on it. Only the fifth starts giving the asking back.
   */
  it("gives the list back only once the extras are gone", () => {
    const purchase = [bought(6, ago(1_000), 2)];

    expect(peelReceipts(purchase, CARROTS, 4, NOW).restored).toBe(0);
    expect(peelReceipts(purchase, CARROTS, 5, NOW).restored).toBe(1);
    expect(peelReceipts(purchase, CARROTS, 6, NOW).restored).toBe(2);
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
      { id: "mon", ...CARROTS, meal: { id: "2026-01-06:dinner", title: "Soupe" }, amount: 2, createdAt: NOW, updatedAt: NOW },
      { id: "fri", ...CARROTS, meal: { id: "2026-01-10:dinner", title: "Soupe" }, amount: 2, createdAt: NOW, updatedAt: NOW },
    ];

    expect(dropMealLines(twice, "2026-01-06:dinner").map((line) => line.id)).toEqual(["fri"]);
  });

  it("never touches a line the shopper added themselves", () => {
    const byHand: GroceryLine[] = [{ id: "own", ...CARROTS, amount: 2, createdAt: NOW, updatedAt: NOW }];

    expect(dropMealLines(byHand, "2026-01-06:dinner")).toEqual(byHand);
  });
});

describe("discharging claims", () => {
  const lines: GroceryLine[] = base.lines;

  it("settles the oldest claim first", () => {
    expect(reduceLines(lines, CARROTS, 2, NOW).map((line) => line.id)).toEqual(["l2"]);
  });

  it("carries over into the next claim", () => {
    expect(reduceLines(lines, CARROTS, 3, NOW).map((line) => line.amount)).toEqual([3]);
  });

  it("clears every claim when everything is used", () => {
    expect(reduceLines(lines, CARROTS, 6, NOW)).toEqual([]);
  });

  it("leaves other ingredients alone", () => {
    expect(reduceLines(lines, { ingredientId: "onions", unit: "g" }, 500, NOW)).toEqual(lines);
  });

  /**
   * A partly drained line was written, so it has to read as touched. Cooking is the caller this
   * is waiting for, and it writes neither a receipt nor a history entry — the two other things
   * `touchedAt` folds in — so the line's own `updatedAt` is the only thing left to carry it.
   */
  it("counts a partial drain as a touch", () => {
    const drained = reduceLines(lines, CARROTS, 3, NOW);

    expect(drained.map((line) => line.updatedAt)).toEqual([NOW]);
  });

  it("leaves a claim it never reached untouched", () => {
    const untouched = reduceLines(lines, { ingredientId: "onions", unit: "g" }, 500, NOW);

    expect(untouched.map((line) => line.updatedAt)).toEqual(lines.map((line) => line.updatedAt));
  });
});

describe("folding ghosts into a section", () => {
  const ghost = (
    id: string,
    intent: PendingIntent,
    state: PendingIngredient["state"] = "resolving",
  ): PendingIngredient => ({ id, name: "yuzu", unit: "pcs", amount: 1, intent, state });

  const sections = buildSections(base);
  const ghostsIn = (section: Section, pending: PendingIngredient[]) =>
    rowsOf(section, sections, pending).filter((row) => row.kind === "ghost");

  /**
   * The card has to appear under the heading the shopper aimed it at. Drawing every ghost in
   * "to-buy" would put the cellar button's card in the wrong section and then move it once it
   * resolved, which is worse than no feedback — the shopper has to watch it jump to learn where it
   * went.
   */
  it("waits in the section its own intent will put it in", () => {
    const pending = [ghost("g1", "relist"), ghost("g2", "buy")];

    expect(ghostsIn("to-buy", pending).map((row) => row.ghost.id)).toEqual(["g1"]);
    expect(ghostsIn("cellar", pending).map((row) => row.ghost.id)).toEqual(["g2"]);
  });

  /**
   * "Recently bought" is defined by exclusion — bought before, owned by nobody, wanted by nobody —
   * and a word with no history cannot satisfy the first clause.
   */
  it("never waits in recently-bought", () => {
    const pending = [ghost("g1", "relist"), ghost("g2", "buy")];

    expect(ghostsIn("recently-bought", pending)).toHaveLength(0);
  });

  /** The card being waited on is the one being looked for, and it has no `updatedAt` to sort by. */
  it("leads its section, ahead of the rows that sort", () => {
    const rows = rowsOf("to-buy", sections, [
      ghost("g1", "relist"),
      ghost("g2", "relist", "failed"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["ghost", "ghost", "stock"]);
  });

  it("leaves a section untouched when nothing is pending", () => {
    expect(rowsOf("to-buy", sections, [])).toHaveLength(sections["to-buy"].length);
  });

  /**
   * The grid decides "draw a header" from this length, so a lone ghost has to make its section
   * non-empty — otherwise the first unknown ingredient a shopper types draws a card with no
   * heading over it. True of the cellar too, which is empty far more often than the list is.
   */
  it("makes an otherwise empty section non-empty", () => {
    const bare = buildSections({ ...base, lines: [], cellar: [] });

    expect(bare["to-buy"]).toHaveLength(0);
    expect(bare.cellar).toHaveLength(0);
    expect(rowsOf("to-buy", bare, [ghost("g1", "relist")])).toHaveLength(1);
    expect(rowsOf("cellar", bare, [ghost("g2", "buy")])).toHaveLength(1);
  });
});

describe("the order the sections render in", () => {
  const STOCK_ORDER: Section[] = ["to-buy", "cellar", "recently-bought"];

  it("promotes the lead and keeps the rest in stock order", () => {
    expect(orderSections([...STOCK_ORDER], "cellar")).toEqual(["cellar", "to-buy", "recently-bought"]);
  });

  it("is the stock order when nobody asked for a section", () => {
    expect(orderSections([...STOCK_ORDER])).toEqual(STOCK_ORDER);
  });

  it("ignores a lead the sections do not hold", () => {
    /** The param is validated upstream; the guard keeps the invariant local. */
    expect(orderSections([...STOCK_ORDER], "nowhere" as Section)).toEqual(STOCK_ORDER);
  });
});

describe("what a section param is allowed to mean", () => {
  it.each(["to-buy", "cellar", "recently-bought"])("accepts %s", (value) => {
    expect(sectionFromParam(value)).toBe(value);
  });

  it("takes the first of a repeated param", () => {
    expect(sectionFromParam(["cellar", "to-buy"])).toBe("cellar");
  });

  it.each([[undefined], [""], ["junk"], [[""]], [[]]])("sees no preference in %s", (value) => {
    expect(sectionFromParam(value)).toBeUndefined();
  });
});

describe("the cellar card's clock", () => {
  const DAY = 86_400_000;
  const inDays = (days: number) => NOW.getTime() + days * DAY;

  const withCellar = (cellar: CellarEntry[]): Snapshot => ({ ...base, cellar });
  const clocks = (snapshot: Snapshot) => {
    const sections = buildSections(snapshot);

    return { toBuy: sections["to-buy"].map((row) => row.expiresSoon), cellar: sections.cellar.map((row) => row.expiresSoon) };
  };

  it("shows on the cellar row going off soon, and never on the row still to buy", () => {
    expect(clocks(withCellar([{ ...base.cellar[0]!, expirationDate: inDays(2) }])))
      .toEqual({ toBuy: [false], cellar: [true] });
  });

  it("stays hidden on a row with time left, or with no date at all", () => {
    expect(clocks(withCellar([{ ...base.cellar[0]!, expirationDate: inDays(10) }])).cellar).toEqual([false]);
    expect(clocks(base).cellar).toEqual([false]);
  });

  it("reads the soonest of the entries the row sums, skipping one that has run out", () => {
    const entry = base.cellar[0]!;

    expect(clocks(withCellar([
      { ...entry, id: "c1", expirationDate: inDays(10) },
      { ...entry, id: "c2", expirationDate: inDays(2) },
    ])).cellar).toEqual([true]);
    expect(clocks(withCellar([
      { ...entry, id: "c1", expirationDate: inDays(10) },
      { ...entry, id: "c2", amount: 0, expirationDate: inDays(2) },
    ])).cellar).toEqual([false]);
  });
});
