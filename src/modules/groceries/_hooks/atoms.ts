import { atom, type Getter, type Setter } from "jotai";

import {
  putInCellar,
  takeFromCellar,
  type CellarEntry,
  type GroceryLine,
  type HistoryEntry,
  type Ingredient,
  type Receipt,
  type StockRef,
  type StockSets,
} from "../_model/model";

/**
 * Module-scoped state for the grocery domain, and the placeholder data it starts from.
 *
 * Jotai rather than component state because two screens read the same sets: the grid and the
 * quantity modal, which is a route of its own and so cannot be handed props down a tree.
 *
 * Everything here is hardcoded on purpose — the interface comes first, so the screens are built
 * against the shape they will keep and the swap to `api.router.groceries.*` touches the hooks in
 * this folder alone (ARCHITECTURE.md § Build order, ADR 0006).
 */

/** One clock for the whole seed, so the ordering of the placeholder rows is stable. */
const SEEDED_AT = new Date();

/**
 * The plates these claims came from, keyed the way planning mints a plate id — `YYYY-MM-DD:slot`.
 * Fixed dates rather than dates around `SEEDED_AT`: nothing reads them yet, and a seed that drifts
 * with the clock is one more thing to explain when it does.
 */
const RATATOUILLE = { id: "2026-01-06:dinner", title: "Ratatouille" };
const SOUPE = { id: "2026-01-07:lunch", title: "Soupe de légumes" };
const TARTE = { id: "2026-01-07:dinner", title: "Tarte au citron" };
const GRATIN = { id: "2026-01-08:dinner", title: "Gratin de courgettes" };

const INGREDIENTS: Ingredient[] = [
  { id: "tomatoes", name: "Tomates", emoji: "🍅" },
  { id: "carrots", name: "Carottes", emoji: "🥕" },
  { id: "peppers", name: "Poivrons", emoji: "🫑" },
  { id: "aubergines", name: "Aubergines", emoji: "🍆" },
  { id: "onions", name: "Oignons", emoji: "🧅" },
  { id: "garlic", name: "Ail", emoji: "🧄" },
  { id: "lemons", name: "Citrons", emoji: "🍋" },
  { id: "parmesan", name: "Parmesan", emoji: "🧀" },
  { id: "bread", name: "Pain", emoji: "🥖" },
  { id: "yoghurt", name: "Yaourts", emoji: "🥛" },
  { id: "butter", name: "Beurre", emoji: "🧈" },
  { id: "pasta", name: "Pâtes", emoji: "🍝" },
];

/**
 * Deliberately holds the same ingredient more than once — carrots are claimed by two plates, and
 * stay two rows. The grid adds them up for display; the store never does.
 *
 * The last two carry no plate: things the shopper wants for their own reasons. They seed the case
 * a plate's claim cannot show — bread is already in the cellar and asked for anyway, so it stands
 * on the list rather than being explained away by what is at home.
 */
const LINES: GroceryLine[] = [
  { id: "line-1", ingredientId: "tomatoes", meal: RATATOUILLE, amount: 500, unit: "g", createdAt: SEEDED_AT },
  { id: "line-2", ingredientId: "tomatoes", meal: SOUPE, amount: 300, unit: "g", createdAt: SEEDED_AT },
  { id: "line-3", ingredientId: "carrots", meal: RATATOUILLE, amount: 2, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-4", ingredientId: "carrots", meal: SOUPE, amount: 4, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-5", ingredientId: "peppers", meal: RATATOUILLE, amount: 3, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-6", ingredientId: "aubergines", meal: RATATOUILLE, amount: 2, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-7", ingredientId: "onions", meal: RATATOUILLE, amount: 1, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-8", ingredientId: "onions", meal: SOUPE, amount: 200, unit: "g", createdAt: SEEDED_AT },
  { id: "line-9", ingredientId: "garlic", meal: RATATOUILLE, amount: 1, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-10", ingredientId: "lemons", meal: TARTE, amount: 4, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-11", ingredientId: "parmesan", meal: GRATIN, amount: 200, unit: "g", createdAt: SEEDED_AT },
  { id: "line-12", ingredientId: "bread", amount: 1, unit: "pcs", createdAt: SEEDED_AT },
  { id: "line-13", ingredientId: "tomatoes", amount: 300, unit: "g", createdAt: SEEDED_AT },
];

/**
 * Carrots seed the case the whole model exists for: six are wanted across two plates, two are
 * already owned, so the list asks for four — and an undo must give back the four, never the two.
 * Two owned rather than one so a partial removal is reachable by hand: take one out and a cellar
 * row is still standing while the list has gone to five, which is this whole gesture made visible
 * in one tap. Carrots never reach memory, and cannot — six are wanted, so the gap is open however
 * empty the cellar gets. Parmesan is the quiet one: owned in exactly the amount its plate asks
 * for, so it shows nowhere but the cellar until it is taken out. Nothing seeded here reaches
 * memory by being emptied — every cellar row is spoken for — so that ending is seeded directly,
 * as the three staples in `HISTORY`.
 */
const CELLAR: CellarEntry[] = [
  { id: "cellar-1", ingredientId: "carrots", unit: "pcs", amount: 2, updatedAt: SEEDED_AT },
  { id: "cellar-2", ingredientId: "parmesan", unit: "g", amount: 200, updatedAt: SEEDED_AT },
  { id: "cellar-3", ingredientId: "bread", unit: "pcs", amount: 1, updatedAt: SEEDED_AT },
];

/**
 * The staples this household has run out of. None is owned and none is wanted, so each shows up
 * under "Recently Bought" — one tap away from being back on the list.
 */
const HISTORY: HistoryEntry[] = [
  { id: "history-1", ingredientId: "yoghurt", unit: "pcs", amount: 4, at: SEEDED_AT },
  { id: "history-2", ingredientId: "butter", unit: "g", amount: 250, at: SEEDED_AT },
  { id: "history-3", ingredientId: "pasta", unit: "g", amount: 500, at: SEEDED_AT },
];

export const ingredientsAtom = atom<Ingredient[]>(INGREDIENTS);

export const linesAtom = atom<GroceryLine[]>(LINES);

export const cellarAtom = atom<CellarEntry[]>(CELLAR);

/** Empty at boot: nothing has been bought this session, so nothing is undoable yet. */
export const receiptsAtom = atom<Receipt[]>([]);

export const historyAtom = atom<HistoryEntry[]>(HISTORY);

/** Read together, so every decision below sees one consistent picture of the store. */
const _sets = (get: Getter): StockSets => ({
  lines: get(linesAtom),
  cellar: get(cellarAtom),
  receipts: get(receiptsAtom),
  history: get(historyAtom),
});

/** Written together, and not at all when the decision was that nothing moves. */
const _write = (set: Setter, next: StockSets | null) => {
  if (!next) return;

  set(linesAtom, next.lines);
  set(cellarAtom, next.cellar);
  set(receiptsAtom, next.receipts);
  set(historyAtom, next.history);
};

/**
 * Taking stock out, as a single write.
 *
 * The one gesture that has to read three sets to decide what it does, and the reason it cannot be
 * three `set*` calls from a hook: a hook closes over the values it had when it last rendered, so
 * two taps landing before React re-renders both compute from the same starting point and the
 * second silently overwrites the first. `get` inside a write atom always reads what is there now,
 * so a second tap builds on the first however fast it arrives.
 *
 * The same now goes for `buy`, which used to need none of this and does now — see below.
 *
 * Only the plumbing lives here. What the write decides is `takeFromCellar`, in `_model/`, where it
 * can be tested without a store.
 */
export const takeFromCellarAtom = atom(
  null,
  (get, set, ref: StockRef, amount: number, at: Date, ids: { history: string; line: string }) =>
    _write(set, takeFromCellar(_sets(get), { ref, amount, at, historyId: ids.history, lineId: ids.line })),
);

/**
 * Stock arriving, as a single write — the same reasoning as its counterpart above.
 *
 * A purchase used to be three independent updaters, which was safe only because it read nothing.
 * It reads now: how much of it settles a line the shopper wrote depends on what those lines
 * currently say, so it belongs on the same footing as taking stock out.
 */
export const putInCellarAtom = atom(
  null,
  (
    get,
    set,
    ref: StockRef,
    amount: number,
    at: Date,
    ids: { cellar: string; receipt: string; history: string },
  ) =>
    _write(
      set,
      putInCellar(_sets(get), {
        ref,
        amount,
        at,
        cellarId: ids.cellar,
        receiptId: ids.receipt,
        historyId: ids.history,
      }),
    ),
);
