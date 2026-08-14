import { useAtom } from "jotai";
import { useCallback } from "react";

import { cellarAtom, historyAtom, linesAtom, receiptsAtom } from "./atoms";
import {
  adjustCellar,
  dropMealLines,
  isLive,
  matchesRef,
  peelReceipts,
  reduceLines,
  rememberStock,
  type CellarEntry,
  type Intent,
  type Receipt,
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

/** How much of this stock is still undoable — the only part a removal gives back to the list. */
const _liveTotal = (receipts: Receipt[], ref: StockRef, now: Date) =>
  receipts
    .filter((receipt) => matchesRef(ref)(receipt) && isLive(receipt, now))
    .reduce((total, receipt) => total + receipt.amount, 0);

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
   * Out of the cellar — and which of the two things that means is decided by the clock, not by
   * the shopper.
   *
   * Whatever a live receipt still covers was a mistap, so it is unwound: the receipt is peeled
   * and the claim on it left standing, which reopens the gap and puts the stock back on the list.
   * Anything past that was food being used, so its claim is discharged too — and an ingredient
   * that is neither owned nor wanted is what "recently bought" is made of.
   *
   * The split falls out of one number, so a single removal can be part undo and part use, and
   * stock owned before the trip is never at risk of being counted as the mistap.
   */
  const removeFromCellar = useCallback(
    (ref: StockRef, amount: number) => {
      const at = new Date();
      const taken = Math.min(amount, _amountOwned(cellar, ref));

      if (taken <= 0) return;

      const remaining = peelReceipts(receipts, ref, taken, at);
      const undone = _liveTotal(receipts, ref, at) - _liveTotal(remaining, ref, at);
      const used = taken - undone;

      setCellar((entries) => adjustCellar(entries, { ref, delta: -taken, now: at, id: _id("cellar") }));
      setReceipts(remaining);
      setHistory((entries) =>
        rememberStock(entries, { ref, amount: taken, at, id: _id("history"), overwriteAmount: false }),
      );

      if (used > 0) setLines((current) => reduceLines(current, ref, used));
    },
    [cellar, receipts, setCellar, setReceipts, setHistory, setLines],
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

  return { apply, dropMeal };
};
