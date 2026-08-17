/**
 * The grocery domain as data, and the pure functions over it.
 *
 * Four sets, and every row on screen is a view of them:
 *
 * - **lines** — what is wanted, one row per ingredient × plate. Never merged on write: dropping a
 *   meal from the week is then deleting its lines, not unpicking a total that has already
 *   forgotten where it came from. A line with no meal is one the shopper added themselves.
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
 * none of, *and* is not being asked for. What is *missing* is never stored, only derived —
 * `needed - owned` — which is what makes the undo safe. Giving a receipt back decrements the cellar and the gap reopens on its
 * own, with no second number to keep in step.
 *
 * Taking stock out is the same move without the receipt: the cellar falls, no claim is touched,
 * and the gap reopens by what left, up to what is still wanted. Food that is no longer in the
 * house has to be bought again if
 * a plate still wants it — so the list grows, and only an ingredient nothing is waiting for ends
 * the run in memory.
 *
 * Settling a claim is a different gesture, and it belongs to the plate rather than the cellar: a
 * dish that gets cooked takes its own lines with it (`dropMealLines`), because it knows which ones
 * they are. Netting the two off here instead moved `needed` and `owned` by the same number, and
 * `needed - owned` never budged.
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
 * The window no longer decides where emptied stock goes — a plate still waiting for it puts it
 * back on the list, and nothing waiting sends it to memory, on both sides of the window. What the
 * window changes is the receipt behind it: inside, the purchase is still on the books, so the row
 * is drawn as reversible and the sheet offers that exact amount back; outside, the row has settled
 * and the sheet offers what is there.
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
   * The plate that asked for it. Absent when the shopper added it themselves.
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
};

/** What this household buys, and how much of it at a time. One row per ingredient and unit. */
export type HistoryEntry = {
  id: string;
  ingredientId: string;
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
  /** Everything asked for, across every plate and anything added by hand. */
  needed: number;
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

const _newest = (dates: Date[], fallback: Date) =>
  dates.reduce((latest, date) => (date > latest ? date : latest), fallback);

export const stockFor = (snapshot: Snapshot, ref: StockRef): Stock => {
  const matches = matchesRef(ref);

  const lines = snapshot.lines.filter(matches);
  const entry = snapshot.cellar.find(matches);
  const remembered = snapshot.history.find(matches);
  const live = snapshot.receipts
    .filter((receipt) => matches(receipt) && isLive(receipt, snapshot.now))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const needed = lines.reduce((total, line) => total + line.amount, 0);
  const owned = entry?.amount ?? 0;

  return {
    needed,
    owned,
    live: live.reduce((total, receipt) => total + receipt.amount, 0),
    toBuy: Math.max(0, needed - owned),
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
export const peelReceipts = (receipts: Receipt[], ref: StockRef, amount: number, now: Date): Receipt[] => {
  const peelable = receipts
    .filter((receipt) => matchesRef(ref)(receipt) && isLive(receipt, now))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  let remaining = amount;
  const drained = new Map<string, number>();

  for (const receipt of peelable) {
    if (remaining <= 0) break;

    const taken = Math.min(remaining, receipt.amount);
    remaining -= taken;
    drained.set(receipt.id, receipt.amount - taken);
  }

  return receipts
    .map((receipt) => {
      const left = drained.get(receipt.id);

      return left === undefined ? receipt : { ...receipt, amount: left };
    })
    .filter((receipt) => receipt.amount > 0);
};

/**
 * Moves the cellar by `delta`, creating the entry if the household has never owned this before
 * and never letting it fall below zero. The cellar is the only stored quantity in the domain —
 * what is missing is derived from it — so this is the one place a number actually changes.
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
 * Keyed by ref, for the same reason the cellar is.
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
  const existing = entries.find(matchesRef(ref));

  if (!existing) return [...entries, { id, ...ref, amount, at }];

  return entries.map((entry) =>
    matchesRef(ref)(entry) ? { ...entry, amount: overwriteAmount ? amount : entry.amount, at } : entry,
  );
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
 * Discharges `amount` of what was asked for, oldest claim first.
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
export const reduceLines = (lines: GroceryLine[], ref: StockRef, amount: number): GroceryLine[] => {
  const claimed = lines
    .filter(matchesRef(ref))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let remaining = amount;
  const drained = new Map<string, number>();

  for (const line of claimed) {
    if (remaining <= 0) break;

    const taken = Math.min(remaining, line.amount);
    remaining -= taken;
    drained.set(line.id, line.amount - taken);
  }

  return lines
    .map((line) => {
      const left = drained.get(line.id);

      return left === undefined ? line : { ...line, amount: left };
    })
    .filter((line) => line.amount > 0);
};

