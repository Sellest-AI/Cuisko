/**
 * The grocery domain as data, and the pure functions over it.
 *
 * Four sets, and every row on screen is a view of them:
 *
 * - **lines** — what is wanted, one row per ingredient × plate. Never merged on write: dropping a
 *   meal from the week is then deleting its lines, not unpicking a total that has already
 *   forgotten where it came from. A line carrying a plate and a line without one are two
 *   different statements, and the list treats them differently — see below.
 * - **cellar** — what the household owns. The single truth of "have".
 * - **receipts** — what went in within the last few minutes, so a mistap at the till can be
 *   undone by its exact amount.
 * - **history** — what has been bought before. Pure memory, and the only set nothing is derived
 *   from; it exists so a shopper can rebuild a list from what they usually buy.
 *
 * One ingredient moves through three states, in this order:
 *
 *     to buy  ──buy──▶  cellar  ──take out──▶  to buy, if a plate still wants it
 *                                         └──────▶  recently bought, if none does
 *                                                        └──put back──▶  to buy
 *
 * "Recently bought" is the end of that run: it holds what the household has dealt in before, owns
 * none of, *and* is not being asked for.
 *
 * **A plate asks differently from a person.** A plate's claim is a requirement — "ratatouille
 * needs two carrots" — and the cellar can answer it, so the meal finds its stock at home and only
 * the shortfall is worth a trip. A line the shopper wrote is an instruction: they knew what was in
 * the kitchen when they typed it, so "buy bread" from someone who already has a loaf means a
 * second loaf, and answering "you have one" is the app overruling a decision already made. Hence
 * `toBuy = max(0, claimed - owned) + wanted` — one half is a gap, the other is a total.
 *
 * They therefore leave the list by different routes. A claim is discharged by the cellar rising
 * underneath it, so buying touches no line and the gap closes itself. An instruction has no gap to
 * close, so buying deletes it outright — and that is the one thing an undo cannot re-derive, which
 * is why a receipt records the bands it filled. Everything else about what is missing stays
 * derived: the cellar falls, and a plate's gap reopens with no second number to keep in step.
 *
 * Taking stock out is the same move without the receipt: the cellar falls, no claim is touched,
 * and the gap reopens by what left, up to what is still wanted. Food that is no longer in the
 * house has to be bought again if a plate still wants it — so the list grows, and only an
 * ingredient nothing is waiting for ends the run in memory.
 *
 * Settling a claim is a different gesture again, and it belongs to the plate rather than the
 * cellar: a dish that gets cooked takes its own lines with it (`dropMealLines`), because it knows
 * which ones they are. Netting the two off in the cellar instead moved what was asked for and what
 * was owned by the same number, and the gap never budged.
 *
 * No React and no Jotai here; `atoms.ts` holds the state and the hooks call into this.
 */

import { type Unit } from "@shared/ingredients";

/** The unit vocabulary and its formatting now live in `shared/`, where planning reaches them too. */
export { formatQuantity, isUnit, UNITS, unitLabel, type Unit } from "@shared/ingredients";

/** Which section a tap came from. Each one can only move stock its own way. */
export const INTENTS = ["buy", "remove", "relist"] as const;
export type Intent = (typeof INTENTS)[number];

export const isIntent = (value: string | undefined): value is Intent =>
  value !== undefined && (INTENTS as readonly string[]).includes(value);

/**
 * How long a purchase stays undoable.
 *
 * Where emptied *stock* goes never depends on it — a plate still waiting for it puts it back on
 * the list, nothing waiting sends it to memory, on both sides of the window. What the window
 * governs is the purchase behind it: inside, the receipt is still on the books, so the row is
 * drawn as reversible, the sheet offers that exact amount back, and giving it back also gives back
 * any line the purchase struck off. Outside, the purchase has settled — putting stock back is the
 * shopper using what they bought, not unmaking the trip, and their list stays as they left it.
 */
export const UNDO_WINDOW_MS = 5 * 60 * 1000;

/** Rows stop reordering by recency this long after their last touch, and go alphabetical. */
const ALPHABETICAL_ORDERING_DELAY_MS = 30 * 1000;

export type Ingredient = {
  id: string;
  name: string;
  /** Stand-in for the produce photo until real ones exist. */
  emoji: string;
};

/** One claim on one ingredient. The unit is whoever asked for it, not normalised. */
export type GroceryLine = {
  id: string;
  ingredientId: string;
  amount: number;
  unit: Unit;
  /**
   * The plate that asked for it. Absent when the shopper added it themselves — which is not a
   * missing field but the difference between a requirement and an instruction: it decides whether
   * the cellar may answer this line, and what it takes to get it off the list.
   *
   * Keyed on the *plate* — one dish on one day — and not on the recipe, because a week serving the
   * same dish twice would otherwise have both plates sharing an id: swapping Tuesday's would take
   * Friday's claims away with it, and the list would quietly stop asking for food still being
   * cooked. `title` rides along for display; nothing matches on it.
   */
  meal?: { id: string; title: string };
  /** Becomes `_creationTime` once this is a table. */
  createdAt: Date;
};

export type CellarEntry = {
  id: string;
  ingredientId: string;
  unit: Unit;
  amount: number;
  updatedAt: Date;
};

/** A purchase, as logged. Giving one back is the undo; nothing else has to be remembered. */
export type Receipt = {
  id: string;
  ingredientId: string;
  unit: Unit;
  amount: number;
  at: Date;
  /**
   * How much of this purchase came off the shopper's own lines rather than out of the plate gap.
   *
   * Stored because it cannot be derived: a line the purchase deleted leaves nothing behind to
   * re-derive it from. A plate's claim needs no such thing — buying never deletes one, only nets
   * against it, and the gap reopens on its own when the cellar falls.
   */
  settled: number;
  /**
   * How much of it was beyond everything anyone had asked for.
   *
   * The second half of the same fact, and the reason two numbers are needed rather than one: a
   * purchase is three bands — what closed the plates' gap, what settled the shopper's own lines,
   * and what nobody wanted yet — and an undo has to know which band it is giving back. `amount`
   * fixes the third, so any two of them locate all three.
   */
  surplus: number;
};

/**
 * What this household buys, and how much of it at a time. **One row per ingredient**, unlike every
 * other set here.
 *
 * The cellar and the list split an ingredient by unit because 500 g and 3 pcs are quantities that
 * cannot be added up. Memory adds nothing up — it only answers "how much do you usually get" — so
 * there is nothing for a second row to protect, and two of them just draw the same ingredient into
 * "Recently Bought" twice. Buying tomatoes by the kilo after buying them by the gram replaces what
 * was there rather than sitting beside it.
 */
export type HistoryEntry = {
  id: string;
  ingredientId: string;
  /**
   * The unit that `amount` is in. Moves with it and never alone — a remembered "1" that kept its
   * old unit after a purchase in a new one would read as 1 g of what was actually a kilo.
   */
  unit: Unit;
  /**
   * How much this household deals in at a time — what the sheet offers first when putting it back
   * on the list, and what the memory row shows. A purchase is the authority on it; an ingredient
   * only ever emptied out is seeded from what the cellar held.
   */
  amount: number;
  at: Date;
};

export type Snapshot = {
  ingredients: Ingredient[];
  lines: GroceryLine[];
  cellar: CellarEntry[];
  receipts: Receipt[];
  history: HistoryEntry[];
  now: Date;
};

/**
 * Ingredient plus unit, because that is the only pair that can legally be added up — 500 g and
 * 3 pcs of the same carrot are two rows, not one. Name is never a key: it is display text.
 */
export const stockKey = (ingredientId: string, unit: Unit) => `${ingredientId}:${unit}`;

export const isLive = (receipt: Receipt, now: Date) =>
  now.getTime() - receipt.at.getTime() < UNDO_WINDOW_MS;

export type StockRef = { ingredientId: string; unit: Unit };

export const matchesRef =
  (ref: StockRef) =>
    (row: StockRef) =>
      row.ingredientId === ref.ingredientId && row.unit === ref.unit;

export type Stock = {
  /**
   * What plates are asking for — a requirement, and so satisfiable from the cellar. A meal finds
   * its ingredients at home and attaches to them; only the shortfall is worth a trip.
   */
  claimed: number;
  /**
   * What the shopper asked for themselves — an instruction, and so never netted against anything.
   *
   * They knew what was in the kitchen when they typed it. "Buy bread" from someone who already has
   * a loaf means a second loaf, and answering "you have one" is the app overruling a decision that
   * was already made. It leaves the list by being bought or by being struck off, never by being
   * explained away.
   */
  wanted: number;
  /** Everything the cellar holds. */
  owned: number;
  /** The part of `owned` still inside the undo window, and so still reversible. */
  live: number;
  /** The gap the shopper has to close. */
  toBuy: number;
  /** The most recent live purchase — what an undo offers first. */
  lastPurchase: Receipt | null;
  /** What was last bought, whether or not any is owned now. */
  lastBought: HistoryEntry | null;
  touchedAt: Date;
};

const _total = (lines: GroceryLine[]) => lines.reduce((sum, line) => sum + line.amount, 0);

/**
 * The latest of `dates`, or `fallback` when there are none.
 *
 * The fallback is a floor for the empty case only, never a starting value — seeding the reduce
 * with it made `snapshot.now` the answer every time, since nothing here is ever touched in the
 * future. Every row then reported the same `touchedAt`, which silently retired the recency sort
 * in `_compare`: every age was zero, so both of its branches were no-ops and rows came out in
 * whatever order `_stockKeys` happened to build them.
 */
const _newest = (dates: Date[], fallback: Date) =>
  dates.reduce<Date | null>((latest, date) => (latest && latest > date ? latest : date), null) ?? fallback;

export const stockFor = (snapshot: Snapshot, ref: StockRef): Stock => {
  const matches = matchesRef(ref);

  const lines = snapshot.lines.filter(matches);
  const entry = snapshot.cellar.find(matches);
  const remembered = snapshot.history.find(matches);
  const live = snapshot.receipts
    .filter((receipt) => matches(receipt) && isLive(receipt, snapshot.now))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const claimed = _total(lines.filter((line) => line.meal));
  const wanted = _total(lines.filter((line) => !line.meal));
  const owned = entry?.amount ?? 0;

  return {
    claimed,
    wanted,
    owned,
    live: live.reduce((total, receipt) => total + receipt.amount, 0),
    /** The shortfall on the plates, plus everything asked for outright. */
    toBuy: Math.max(0, claimed - owned) + wanted,
    lastPurchase: live[0] ?? null,
    lastBought: remembered ?? null,
    touchedAt: _newest(
      [
        ...lines.map((line) => line.createdAt),
        ...live.map((receipt) => receipt.at),
        ...(entry ? [entry.updatedAt] : []),
        ...(remembered ? [remembered.at] : []),
      ],
      snapshot.now,
    ),
  };
};

export type Section = "to-buy" | "cellar" | "recently-bought";

/** A section can only move stock its own way, so the tap never has to be told what it meant. */
const INTENT_FOR: Record<Section, Intent> = {
  "to-buy": "buy",
  cellar: "remove",
  "recently-bought": "relist",
};

export type QuantityOption = {
  amount: number;
  unit: Unit;
  /** Set on the first tile only — what makes it the answer rather than one choice among nine. */
  caption?: string;
  /** Undo tiles are drawn apart: they take a purchase back rather than commit a new one. */
  type?: "undo" | "default";
};

/**
 * The ladder offered when no amount is obvious. Placeholder: real steps follow the ingredient,
 * which is also where the free-text input and the per-ingredient normalising will land.
 */
const STEPS: Record<Unit, number[]> = {
  g: [50, 100, 150, 200, 250, 300, 400, 500, 750],
  mg: [100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000],
  kg: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6],
  lb: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6],
  oz: [1, 2, 3, 4, 5, 6, 8, 10, 12],
  cl: [10, 20, 25, 33, 50, 75, 100, 150, 200],
  ml: [50, 100, 150, 200, 250, 300, 500, 750, 1000],
  l: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5],
  pcs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  cs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  cc: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

const OPTION_COUNT = 9;

/**
 * What the quantity sheet offers, first tile first.
 *
 * The opening tile is the amount the shopper most likely means, so the common case is one tap:
 * everything still missing when adding, the purchase just made when undoing a mistap, the whole
 * row once it has settled, and the usual amount when pulling something back out of memory.
 *
 * Undoing proposes the *last* receipt rather than the live total — two trips to the same shelf are
 * two mistakes to unmake, not one. Removals are capped at what the cellar actually holds; adding
 * is not capped at all, since a shopper may come home with more than the week asks for.
 *
 * Pure, and computed for every row rather than only for the open sheet, because a row that leaves
 * the shopper no choice should not be asking the question at all.
 */
export const quantityOptions = (stock: Stock, unit: Unit, intent: Intent): QuantityOption[] => {
  const proposed = (): { amount: number; caption: string; type: "undo" | "default" } => {
    if (intent === "buy") return { amount: stock.toBuy, caption: "Needed", type: "default" };
    if (intent === "relist") {
      return { amount: stock.lastBought?.amount ?? 0, caption: "Last time", type: "default" };
    }

    /** Inside the window the cellar row is still a purchase, so removing it is unmaking one. */
    return stock.lastPurchase
      ? { amount: stock.lastPurchase.amount, caption: "Just added", type: "undo" }
      : { amount: stock.owned, caption: "All of it", type: "default" };
  };

  const { amount, caption, type } = proposed();
  const ceiling = intent === "remove" ? stock.owned : null;

  const ladder = STEPS[unit]
    .filter((step) => step !== amount && (ceiling === null || step <= ceiling))
    .map((step): QuantityOption => ({ amount: step, unit }));

  const suggestion: QuantityOption[] = amount > 0 ? [{ amount, unit, caption, type }] : [];

  return [...suggestion, ...ladder].slice(0, OPTION_COUNT);
};

/** What a card draws. Structural on purpose — `src/ui` never learns these types (ADR 0002). */
export type StockRow = {
  /**
   * Stable across a change of section, which is what lets the card fly rather than fade.
   *
   * An ingredient usually holds one row, and that row keeps the bare `ingredient:unit` key
   * wherever it sits — so buying it moves the same mounted card from "To Buy" into the cellar and
   * React carries it there. A partly-owned ingredient holds two rows at once and they cannot both
   * be that key, so the extra one is section-scoped.
   *
   * Only one of the two can follow the ingredient's whole cycle, and the bare key follows buying:
   * a to-buy card carries into the cellar, and the leftover fades as the two rows merge. Emptying
   * a partly-owned cellar row is the direction that loses out — `cellar:carrots:pcs` unmounts and
   * the to-buy card grows instead. Nothing flies there, because there is no destination row: the
   * amount merges into a card that was already on screen.
   */
  id: string;
  section: Section;
  ingredientId: string;
  name: string;
  emoji: string;
  amount: number;
  unit: Unit;
  /** A cellar row whose purchase is still reversible. Drawn as such, and tapped to undo. */
  undoable: boolean;
  /** What tapping this row does. Fixed by the section it sits in. */
  intent: Intent;
  /**
   * The single amount this row could possibly move, when the sheet would offer exactly one tile.
   * A one-tap answer to a question with one answer, so the card acts instead of asking.
   */
  onlyOption: number | null;
  updatedAt: Date;
};

/**
 * Recency first, then alphabetical.
 *
 * A list that reorders itself while it is being read is worse than one that is merely stale, so
 * a row only rides the recency sort while it is fresh; after that it settles into its name and
 * stays put. `asc` puts the newest first — a smaller age is a more recent touch.
 */
const _compare = (a: StockRow, b: StockRow, order: "asc" | "desc", now: Date) => {
  const ageOf = (row: StockRow) => now.getTime() - row.updatedAt.getTime();
  const [aAge, bAge] = [ageOf(a), ageOf(b)];

  if (aAge > ALPHABETICAL_ORDERING_DELAY_MS && bAge > ALPHABETICAL_ORDERING_DELAY_MS) {
    return a.name.localeCompare(b.name);
  }

  return order === "asc" ? aAge - bAge : bAge - aAge;
};

/** Every ingredient+unit pair mentioned anywhere in the snapshot, each once. */
const _stockKeys = (snapshot: Snapshot): StockRef[] => {
  const keys = new Map<string, StockRef>();

  const add = ({ ingredientId, unit }: StockRef) =>
    keys.set(stockKey(ingredientId, unit), { ingredientId, unit });

  snapshot.lines.forEach(add);
  snapshot.cellar.forEach(add);
  snapshot.receipts.forEach(add);
  snapshot.history.forEach(add);

  return [...keys.values()];
};

export type Sections = Record<Section, StockRow[]>;

/**
 * The three sections, sorted and ready to render.
 *
 * "Recently bought" is defined by exclusion — bought before, not owned now, not wanted now — so
 * it needs no emptying and no expiry. An ingredient lands there the moment the cellar row and the
 * to-buy row are both gone, and leaves the instant either comes back.
 */
export function buildSections(snapshot: Snapshot): Sections {
  const rows = _stockKeys(snapshot).flatMap((ref): StockRow[] => {
    const ingredient = snapshot.ingredients.find(({ id }) => id === ref.ingredientId);
    if (!ingredient) return [];

    const stock = stockFor(snapshot, ref);

    /**
     * Neither owned nor wanted, but bought before: all that is left of it is the memory.
     *
     * Gated on the gap being closed as well as the cellar being empty, because taking stock out
     * reopens that gap: an ingredient a plate is still waiting for goes back on the list, and only
     * one nothing is waiting for ends the run here. That is the whole difference between the bread
     * and the carrots.
     */
    const forgotten = stock.owned === 0 && stock.toBuy === 0 ? stock.lastBought : null;

    /** In priority order — the first one standing is the row that carries the ingredient's key. */
    const present = [
      stock.toBuy > 0 ? { section: "to-buy" as const, amount: stock.toBuy, undoable: false } : null,
      stock.owned > 0 ? { section: "cellar" as const, amount: stock.owned, undoable: stock.live > 0 } : null,
      forgotten ? { section: "recently-bought" as const, amount: forgotten.amount, undoable: false } : null,
    ].filter((candidate) => candidate !== null);

    const key = stockKey(ref.ingredientId, ref.unit);

    return present.map(({ section, amount, undoable }, index): StockRow => {
      const intent = INTENT_FOR[section];
      const [only, ...rest] = quantityOptions(stock, ref.unit, intent);

      return {
        id: index === 0 ? key : `${section}:${key}`,
        section,
        ingredientId: ref.ingredientId,
        name: ingredient.name,
        emoji: ingredient.emoji,
        amount,
        unit: ref.unit,
        undoable,
        intent,
        onlyOption: only && rest.length === 0 ? only.amount : null,
        updatedAt: stock.touchedAt,
      };
    });
  });

  const section = (name: Section, order: "asc" | "desc") =>
    rows.filter((row) => row.section === name).sort((a, b) => _compare(a, b, order, snapshot.now));

  return {
    "to-buy": section("to-buy", "desc"),
    cellar: section("cellar", "asc"),
    "recently-bought": section("recently-bought", "asc"),
  };
}

/**
 * Takes `amount` off the newest live receipts first.
 *
 * Last in, first out, because the receipt a shopper wants back is the one they just made — and
 * peeling from the newest end makes a partial undo the exact inverse of the purchase that
 * created it. Receipts drained to zero are dropped; expired ones are never touched, so asking
 * for more than was recently bought simply stops at the live edge.
 */
export const peelReceipts = (
  receipts: Receipt[],
  ref: StockRef,
  amount: number,
  now: Date,
): { receipts: Receipt[]; restored: number } => {
  const peelable = receipts
    .map((receipt, at) => ({ receipt, at }))
    .filter(({ receipt }) => matchesRef(ref)(receipt) && isLive(receipt, now))
    .sort((a, b) => b.receipt.at.getTime() - a.receipt.at.getTime());

  let remaining = amount;

  /** Keyed by position, for the reason `_discharge` is: an id is only as unique as its minter. */
  const drained = new Map<number, number>();

  for (const { receipt, at } of peelable) {
    if (remaining <= 0) break;

    const taken = Math.min(remaining, receipt.amount);
    remaining -= taken;
    drained.set(at, receipt.amount - taken);
  }

  let restored = 0;

  const left = receipts
    .map((receipt, at) => {
      const amountLeft = drained.get(at);

      if (amountLeft === undefined) return receipt;

      /**
       * A receipt is three bands stacked in the order they were allocated — the plates' gap at the
       * bottom, then the shopper's own lines, then whatever nobody had asked for — and peeling
       * takes from the top, so an undo is the exact inverse of the purchase.
       *
       * Surplus goes back first and costs nothing: buy six when the list asked for two, give four
       * back, and the list stays clear because the four returned were never on it. Past that the
       * settled band starts coming back as lines. The gap band is last and needs no help — giving
       * it back drops the cellar, and the plate's shortfall reopens by itself.
       *
       * Taking the settled band as the *bottom* was the bug: giving 300 g back out of an 1100 g
       * purchase left the cellar exactly covering the plates, restored nothing, and quietly lost
       * the 300 g the shopper had asked for on their own account.
       */
      const gapBand = receipt.amount - receipt.settled - receipt.surplus;
      const settled = Math.min(Math.max(amountLeft - gapBand, 0), receipt.settled);
      const surplus = amountLeft - Math.min(gapBand, amountLeft) - settled;

      restored += receipt.settled - settled;

      return { ...receipt, amount: amountLeft, settled, surplus };
    })
    .filter((receipt) => receipt.amount > 0);

  return { receipts: left, restored };
};

/**
 * Moves the cellar by `delta`, creating the entry if the household has never owned this before
 * and never letting it fall below zero. The cellar is the only stored quantity the *gap* is
 * derived from, so this is the one place that number moves.
 *
 * Rows are found *and* written by ref. Ingredient plus unit is the real key here: at most one
 * cellar row can exist for it, whereas an id is only as unique as whatever minted it.
 */
export const adjustCellar = (
  entries: CellarEntry[],
  { ref, delta, now, id }: { ref: StockRef; delta: number; now: Date; id: string },
): CellarEntry[] => {
  const existing = entries.find(matchesRef(ref));

  if (!existing) {
    if (delta <= 0) return entries;

    return [...entries, { id, ...ref, amount: delta, updatedAt: now }];
  }

  const amount = Math.max(0, existing.amount + delta);

  return entries.map((entry) => (matchesRef(ref)(entry) ? { ...entry, amount, updatedAt: now } : entry));
};

/**
 * Records that this household deals in this ingredient.
 *
 * `amount` is only overwritten by a purchase — that is the one gesture that actually knows how much
 * the household buys at a time, so nothing else may talk over it. A first touch has to write
 * something regardless, and the caller picks what: an emptied cellar passes what it held, never
 * what happened to leave it.
 *
 * Keyed by *ingredient*, not by ref — the one place in this file that is — so a household that
 * buys tomatoes by the gram and then by the kilo is remembered once, in kilos. `unit` therefore
 * moves only when `amount` does: they are one fact, and rewriting either alone produces a number
 * measured in something nobody bought.
 */
export const rememberStock = (
  entries: HistoryEntry[],
  {
    ref,
    amount,
    at,
    id,
    overwriteAmount,
  }: { ref: StockRef; amount: number; at: Date; id: string; overwriteAmount: boolean },
): HistoryEntry[] => {
  const remembers = (entry: HistoryEntry) => entry.ingredientId === ref.ingredientId;

  if (!entries.some(remembers)) return [...entries, { id, ...ref, amount, at }];

  return entries.map((entry) =>
    remembers(entry) ? { ...entry, at, ...(overwriteAmount ? { unit: ref.unit, amount } : {}) } : entry,
  );
};

/** The four stored sets, as one value. What a write touches, and what it has to read to decide. */
export type StockSets = {
  lines: GroceryLine[];
  cellar: CellarEntry[];
  receipts: Receipt[];
  history: HistoryEntry[];
};

/**
 * Stock arriving, decided in one pass.
 *
 * A purchase does two things at once, and which is which depends on who was asking. What a plate
 * wanted is settled by the cellar rising — the gap is derived, so it closes itself and no line is
 * touched. What the shopper asked for outright has no gap to close, so buying it is the only thing
 * that takes it off the list, and the line is discharged here.
 *
 * How much of the purchase did that is written onto the receipt, because it is the one fact an
 * undo cannot work out for itself: the line it deleted is gone, and nothing is left to re-derive.
 */
export const putInCellar = (
  { lines, cellar, receipts, history }: StockSets,
  {
    ref,
    amount,
    at,
    cellarId,
    receiptId,
    historyId,
  }: { ref: StockRef; amount: number; at: Date; cellarId: string; receiptId: string; historyId: string },
): StockSets | null => {
  if (amount <= 0) return null;

  const mine = matchesRef(ref);
  const claimed = _total(lines.filter((line) => mine(line) && line.meal));
  const asked = _total(lines.filter((line) => mine(line) && !line.meal));
  const owned = cellar.find(mine)?.amount ?? 0;

  /**
   * The plates are served first, and that order is forced rather than chosen.
   *
   * `toBuy` nets the whole cellar against the claims, so every unit that arrives closes the plate
   * gap whether anyone meant it to or not. Settling an own line out of the same units spends them
   * twice: 800 g claimed and 300 g asked for outright is a list of 1100, and buying 300 g used to
   * take it to 500 — the shopper bought 300 and the list fell by 600. Only what is left once the
   * gap is covered can settle a line, because only that part is not already spoken for.
   */
  const gap = Math.max(0, claimed - owned);
  const settled = Math.max(0, Math.min(amount - gap, asked));
  const surplus = amount - Math.min(amount, gap) - settled;

  return {
    lines: settled > 0 ? reduceOwnLines(lines, ref, settled) : lines,
    cellar: adjustCellar(cellar, { ref, delta: amount, now: at, id: cellarId }),
    receipts: [...receipts, { id: receiptId, ...ref, amount, at, settled, surplus }],
    history: rememberStock(history, { ref, amount, at, id: historyId, overwriteAmount: true }),
  };
};

/**
 * Taking stock out of the cellar, decided in one pass over all three sets.
 *
 * One function rather than three writes because the three are not independent: how much actually
 * leaves is capped by the cellar, and that same number drives which receipts are peeled and what
 * the memory records. Computed apart, each write is answering the question against its own idea of
 * "now" — which is exactly how two quick taps produced a live receipt for stock nobody owned.
 *
 * Pure, so the arithmetic can be tested without a store; `atoms.ts` owns the reading and writing.
 * Ids arrive from the caller for the same reason — minting one is not a decision this can make.
 *
 * Returns `null` when nothing moves, so the caller can leave every set untouched rather than
 * writing three identical values back and waking everything subscribed to them.
 */
export const takeFromCellar = (
  { lines, cellar, receipts, history }: StockSets,
  {
    ref,
    amount,
    at,
    historyId,
    lineId,
  }: { ref: StockRef; amount: number; at: Date; historyId: string; lineId: string },
): StockSets | null => {
  const owned = cellar.find(matchesRef(ref))?.amount ?? 0;
  const taken = Math.min(amount, owned);

  if (taken <= 0) return null;

  const peeled = peelReceipts(receipts, ref, taken, at);

  return {
    /**
     * Whatever the peel gave back was a line a purchase had deleted, so putting the stock back
     * has to put the asking back too — otherwise undoing a mistap quietly drops what the shopper
     * had written down. It returns as one fresh line: it carries no plate, so there is no identity
     * to preserve, and merging it into an existing line would lose nothing but say less.
     */
    lines: peeled.restored > 0
      ? [...lines, { id: lineId, ...ref, amount: peeled.restored, createdAt: at }]
      : lines,
    /** The id is dead weight here: a negative delta never creates a row, and `taken > 0` proves
     *  this one already exists. `adjustCellar` asks for it because adding is the other caller. */
    cellar: adjustCellar(cellar, { ref, delta: -taken, now: at, id: "" }),
    receipts: peeled.receipts,
    /** Seeded with what was held, not what left — see `rememberStock`. */
    history: rememberStock(history, { ref, amount: owned, at, id: historyId, overwriteAmount: false }),
  };
};

/**
 * The list without what one plate was asking for.
 *
 * The counterpart to putting a dish on a plate: swapping Tuesday's dinner or dropping it from the
 * week has to take its claims with it, or the list goes on shopping for a meal nobody is cooking.
 * Lines the shopper added by hand carry no plate and so are never caught by this — which is the
 * whole reason a hand-added line is stored without one.
 *
 * Deleted rather than reduced. A plate's claims are the plate's; there is no shared total to unpick,
 * which is exactly what keeping one line per ingredient × plate buys.
 */
export const dropMealLines = (lines: GroceryLine[], mealId: string): GroceryLine[] =>
  lines.filter((line) => line.meal?.id !== mealId);

/**
 * The list without this ingredient at all, whoever asked for it.
 *
 * The shopper striking a row off by hand, and the bluntest of the three: it takes plates' claims
 * with it, not just anything hand-added. That is the intent — the gesture means "I am not buying
 * this", and a claim left standing would put the row straight back on the list — but it is worth
 * being plain about the cost. The plates go on being cooked and the week stops shopping for them,
 * and nothing rebuilds a meal-bound line, so this cannot be undone from inside the app.
 *
 * The narrower `dropMealLines` is what a plate leaving the week uses; this one is keyed by
 * ingredient because that is all the tapped card knows.
 */
export const dropIngredientLines = (lines: GroceryLine[], ref: StockRef): GroceryLine[] =>
  lines.filter((line) => !matchesRef(ref)(line));

/**
 * Drains `amount` from the claims the caller says are eligible, oldest first.
 *
 * The shared half of `reduceLines` and `reduceOwnLines` — the predicate is the whole difference
 * between them, and it is what keeps a purchase from settling a plate's claim.
 */
const _discharge = (
  lines: GroceryLine[],
  eligible: (line: GroceryLine) => boolean,
  amount: number,
): GroceryLine[] => {
  const claims = lines
    .map((line, at) => ({ line, at }))
    .filter(({ line }) => eligible(line))
    .sort((a, b) => a.line.createdAt.getTime() - b.line.createdAt.getTime());

  let remaining = amount;

  /**
   * Keyed by position, not by id. Two lines sharing an id is a bug wherever it comes from, but
   * keying on one turns it into a silent deletion — draining a bread line would take a tomato
   * line with the same id down with it — and a seed file is exactly where that typo happens.
   */
  const drained = new Map<number, number>();

  for (const { line, at } of claims) {
    if (remaining <= 0) break;

    const taken = Math.min(remaining, line.amount);
    remaining -= taken;
    drained.set(at, line.amount - taken);
  }

  return lines
    .map((line, at) => {
      const left = drained.get(at);

      return left === undefined ? line : { ...line, amount: left };
    })
    .filter((line) => line.amount > 0);
};

/**
 * Discharges `amount` of what was asked for, oldest claim first, plate-bound claims included.
 *
 * **Nothing calls this yet, and that is deliberate — do not delete it.** It is here for cooking:
 * the last step of a recipe will report what it actually used, settling those claims and taking
 * the same amount out of the cellar. Emptying a cellar row by hand is a different statement — the
 * food is no longer here, and a plate still waiting for it needs it bought again — so that path
 * deliberately leaves claims standing, which is why the only caller it ever had was removed.
 *
 * Reaching it from the recipe module goes through a groceries hook and `hooks.ts`; `_model/` is
 * private and lint R8 blocks the direct import.
 *
 * The pair with `dropMealLines` is the difference between a plate that got cooked and one that
 * left the week. Cooking discharges by ingredient, because that is what the step knows; a plate
 * dropped from the week takes its own lines whole, having fed nobody. Oldest first is the
 * placeholder half: until a step says which lines it drew on, the earliest claim is the guess.
 */
export const reduceLines = (lines: GroceryLine[], ref: StockRef, amount: number): GroceryLine[] =>
  _discharge(lines, matchesRef(ref), amount);

/**
 * The same discharge, but only against what the shopper asked for themselves.
 *
 * What a purchase settles, and only out of what is left once the plates are covered — see
 * `putInCellar` for why that order is forced rather than chosen. A plate's claim is netted against
 * the cellar and so needs no touching when stock arrives; the gap closes on its own. An instruction
 * has no gap to close, so buying it is the only thing that can take it off the list, and it is
 * deleted rather than netted.
 *
 * Oldest first, and it never reaches a meal-bound line: buying bread cannot quietly settle the
 * ratatouille's claim on it, which would leave a dish being cooked with nothing shopping for it.
 */
export const reduceOwnLines = (lines: GroceryLine[], ref: StockRef, amount: number): GroceryLine[] =>
  _discharge(lines, (line) => matchesRef(ref)(line) && !line.meal, amount);

