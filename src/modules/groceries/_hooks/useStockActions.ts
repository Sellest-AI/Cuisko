import { useSetAtom } from "jotai";
import { useCallback } from "react";

import { linesAtom, putInCellarAtom, takeFromCellarAtom } from "./atoms";
import { dropIngredientLines, dropMealLines, type Intent, type StockRef } from "../_model/model";

/**
 * Placeholder ids, until Convex issues them.
 *
 * Random rather than counted. A counter starting from zero mints `cellar-1` for the first row it
 * creates — which is already the seeded carrots row — and the duplicate stays invisible right up
 * until something updates one of them and silently hits the other too.
 */
const _id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The three ways stock moves, one per section a tap can come from.
 *
 * Separate from `useGroceryList` because the quantity modal is a route of its own: it needs to
 * write without deriving the grid it is drawn over.
 */
export const useStockActions = () => {
  /**
   * Write handles only. Nothing here reads a set — the two write atoms do their own reading, and
   * the line-only writes go through updaters — so subscribing would re-render every caller of this
   * hook on every change to a value it never looks at.
   */
  const setLines = useSetAtom(linesAtom);
  const putIn = useSetAtom(putInCellarAtom);
  const takeOut = useSetAtom(takeFromCellarAtom);

  /**
   * Into the basket: the cellar grows, the purchase is logged so it can be taken back, and
   * anything the shopper had written down for themselves is struck off by it.
   */
  const buy = useCallback(
    (ref: StockRef, amount: number) =>
      putIn(ref, amount, new Date(), {
        cellar: _id("cellar"),
        receipt: _id("receipt"),
        history: _id("history"),
      }),
    [putIn],
  );

  /**
   * Out of the cellar, and out of the house. Where the stock goes is the same whatever the clock
   * says; what the clock still governs is whether the trip that brought it is being unmade.
   *
   * Claims are left standing. The plates that wanted this ingredient still want it, and it is no
   * longer here — so the derived gap reopens by what left, up to what is still wanted, and the
   * list asks for it again.
   * Discharging the claims instead made `claimed` and `owned` fall by the same number, which left
   * `claimed - owned` untouched: taking the last carrots out changed nothing on screen, and the
   * shopper had no way to tell that from having lost them.
   *
   * Cooking is the gesture that settles a claim, and it is not this one — it arrives from the
   * plate, which knows which lines are its own instead of guessing (see `dropMealLines`).
   *
   * What the clock decides is what the peel gives back. A live receipt is unmade: the purchase
   * stops being offered as an undo, and any line it struck off returns, because reversing a trip
   * has to reverse all of it. A settled one is left alone — the shopper bought that food and is
   * now using it, and their list is none of this gesture's business. The memory is untouched
   * either way; `buy` recorded the ingredient when it was tapped, and putting it back does not
   * un-know it.
   *
   * How much leaves, which receipts go and what the memory keeps are one decision over all three
   * sets, so they are made together in `takeFromCellar` and written together by the atom. Three
   * `set*` calls from here would each read the cellar as this render found it, and a second tap
   * arriving before the re-render would undo the first.
   */
  const removeFromCellar = useCallback(
    (ref: StockRef, amount: number) =>
      takeOut(ref, amount, new Date(), { history: _id("history"), line: _id("line") }),
    [takeOut],
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
