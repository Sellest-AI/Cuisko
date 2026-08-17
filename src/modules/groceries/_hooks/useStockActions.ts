import { useAtom } from "jotai";
import { useCallback } from "react";

import { cellarAtom, historyAtom, linesAtom, receiptsAtom } from "./atoms";
import {
  adjustCellar,
  dropIngredientLines,
  dropMealLines,
  matchesRef,
  peelReceipts,
  rememberStock,
  type CellarEntry,
  type Intent,
  type StockRef,
} from "../_model/model";

/**
 * Placeholder ids, until Convex issues them.
 *
 * Random rather than counted. A counter starting from zero mints `cellar-1` for the first row it
 * creates — which is already the seeded carrots row — and the duplicate stays invisible right up
 * until something updates one of them and silently hits the other too.
 */
const _id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const _amountOwned = (entries: CellarEntry[], ref: StockRef) =>
  entries.find(matchesRef(ref))?.amount ?? 0;

/**
 * The three ways stock moves, one per section a tap can come from.
 *
 * Separate from `useGroceryList` because the quantity modal is a route of its own: it needs to
 * write without deriving the grid it is drawn over.
 */
export const useStockActions = () => {
  const [, setLines] = useAtom(linesAtom);
  const [cellar, setCellar] = useAtom(cellarAtom);
  const [receipts, setReceipts] = useAtom(receiptsAtom);
  const [, setHistory] = useAtom(historyAtom);

  /** Into the basket: the cellar grows, and the purchase is logged so it can be taken back. */
  const buy = useCallback(
    (ref: StockRef, amount: number) => {
      if (amount <= 0) return;

      const at = new Date();

      setCellar((entries) => adjustCellar(entries, { ref, delta: amount, now: at, id: _id("cellar") }));
      setReceipts((current) => [...current, { id: _id("receipt"), ...ref, amount, at }]);
      setHistory((entries) =>
        rememberStock(entries, { ref, amount, at, id: _id("history"), overwriteAmount: true }),
      );
    },
    [setCellar, setReceipts, setHistory],
  );

  /**
   * Out of the cellar, and out of the house. One meaning, whatever the clock says.
   *
   * Claims are left standing. The plates that wanted this ingredient still want it, and it is no
   * longer here — so the derived gap reopens by what left, up to what is still wanted, and the
   * list asks for it again.
   * Discharging the claims instead made `needed` and `owned` fall by the same number, which left
   * `needed - owned` untouched: taking the last carrots out changed nothing on screen, and the
   * shopper had no way to tell that from having lost them.
   *
   * Cooking is the gesture that settles a claim, and it is not this one — it arrives from the
   * plate, which knows which lines are its own instead of guessing (see `dropMealLines`).
   *
   * The clock still decides one thing: a live receipt is peeled, so the purchase stops being
   * offered back as an undo. It does not unwrite the memory — `buy` recorded the ingredient the
   * moment it was tapped, and putting it back does not un-know it. Both halves reopen the same
   * gap, so nothing here needs to know which half it was in.
   */
  const removeFromCellar = useCallback(
    (ref: StockRef, amount: number) => {
      const at = new Date();
      const owned = _amountOwned(cellar, ref);
      const taken = Math.min(amount, owned);

      if (taken <= 0) return;

      setCellar((entries) => adjustCellar(entries, { ref, delta: -taken, now: at, id: _id("cellar") }));
      setReceipts(peelReceipts(receipts, ref, taken, at));
      /**
       * Seeded with what the cellar held, not with what left it. A purchase overwrites this and is
       * the better answer; until one happens the closest thing to "how much do I buy at a time" is
       * how much was in the house — taking one carrot out of two does not mean the household buys
       * one carrot.
       */
      setHistory((entries) =>
        rememberStock(entries, { ref, amount: owned, at, id: _id("history"), overwriteAmount: false }),
      );
    },
    [cellar, receipts, setCellar, setReceipts, setHistory],
  );

  /**
   * Back onto the list from memory, as a claim the shopper made rather than a plate. It carries
   * no plate, so dropping a meal from the week can never take it away again.
   */
  const addToList = useCallback(
    (ref: StockRef, amount: number) => {
      if (amount <= 0) return;

      setLines((current) => [...current, { id: _id("line"), ...ref, amount, createdAt: new Date() }]);
    },
    [setLines],
  );

  /**
   * One amount, routed by where the tap came from. Both callers go through here — the sheet, and
   * the card that skips the sheet because there was only ever one amount to pick.
   */
  const apply = useCallback(
    (intent: Intent, ref: StockRef, amount: number) => {
      if (intent === "buy") return buy(ref, amount);
      if (intent === "remove") return removeFromCellar(ref, amount);

      return addToList(ref, amount);
    },
    [buy, removeFromCellar, addToList],
  );

  /**
   * Strike an ingredient off the list, leaving the cellar and its receipts alone.
   *
   * Nothing was bought and nothing was used, so no stock moves — this is the shopper overruling
   * the list, not reporting on the house. Every claim goes with it, plates included, which is
   * blunt and irreversible; `dropIngredientLines` says why it is still the right shape.
   */
  const forceRemove = useCallback(
    (ref: StockRef) => setLines((current) => dropIngredientLines(current, ref)),
    [setLines],
  );

  /**
   * A plate left the week, so the list stops shopping for it.
   *
   * The plan→groceries seam, and the reason a line carries the plate it came from: planning knows
   * the plate id and nothing else about this module, so dropping a meal is one call rather than
   * planning reaching in to work out which lines were its own.
   *
   * Only claims are taken. What the shopper already bought is in the cellar, which this does not
   * touch — food in the house does not stop existing because a plan changed its mind.
   */
  const dropMeal = useCallback(
    (mealId: string) => setLines((current) => dropMealLines(current, mealId)),
    [setLines],
  );

  return { apply, dropMeal, forceRemove };
};
