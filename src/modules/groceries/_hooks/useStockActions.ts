import { useSetAtom } from "jotai";
import { useCallback, useState } from "react";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";
import { householdSession } from "~/modules/households/household-atom";
import { useHousehold } from "~/modules/households/hooks";

import { receiptsAtom } from "./atoms";
import { matchesRef, peelReceipts, putInCellar, type Intent, type StockRef } from "../_model/model";
import { useSnapshot } from "./useSnapshot";

/**
 * The model keys stock by ingredient id and unit, and knows nothing about which table those ids
 * came from — that is what lets `_model/` be tested without a database. Convex wants the branded
 * type back at the seam, and this is the seam.
 */
const _ingredient = (id: string) => id as Id<"ingredients">;

/**
 * Every write below is household-scoped, and there is no household until someone is signed in.
 *
 * Returning early is the only correct thing to do — there is nowhere to write — but doing it
 * quietly means a tap that lands on a card and produces nothing at all, with no error, no log and
 * no failed request to find. This says so once, where the next person to hit it is looking.
 */
const _scoped = (householdId: Id<"households"> | undefined, gesture: string) => {
  if (householdId) return householdId;

  if (__DEV__) {
    console.warn(`[useStockActions] "${gesture}" dropped: no household. Is anyone signed in?`);
  }

  return null;
};

/**
 * The three ways stock moves, one per section a tap can come from.
 *
 * Separate from `useGroceryList` because the quantity modal is a route of its own: it needs to
 * write without deriving the grid it is drawn over.
 *
 * **Who decides what.** The list, the cellar and what the household has bought before are the
 * server's — each mutation reads them fresh inside its own transaction, so two taps landing before
 * a re-render both count, and a second device sees the result. What stays here is the receipt: the
 * bands a purchase filled, which the server has no record of and could not re-derive, because
 * buying *deletes* the lines it settles.
 *
 * Those bands are computed from the snapshot as this render found it. Two taps arriving inside one
 * render therefore split the same starting list between them — the shelf still ends up right,
 * because the server did that arithmetic, but the second receipt can misjudge how much of itself
 * settled a line. The cost is bounded by what a receipt is for: an undo inside five minutes gives
 * back slightly the wrong amount. The alternative — asking the server to hold receipts — is the
 * `receipts` table this slice deliberately did not build.
 */
export const useStockActions = () => {
  const { householdId } = useHousehold();
  const snapshot = useSnapshot();
  const setReceipts = useSetAtom(receiptsAtom);
  const [error, setError] = useState<Error | null>(null);

  const { mutate: addToCellar } = useMutation(api.router.cellars.addToCellar.authed);
  const { mutate: takeFromCellar } = useMutation(api.router.cellars.removeFromCellar.authed);
  const { mutate: addToList } = useMutation(api.router.cellars.addToGroceryList.authed);
  const { mutate: removeFromList } = useMutation(api.router.cellars.removeFromGroceryList.authed);

  /**
   * Into the basket: the cellar grows, anything the shopper had written down for themselves is
   * struck off by it, and the purchase is logged so it can be taken back.
   *
   * The server does the first two. `putInCellar` is still what decides the third — it splits the
   * purchase into the plates' gap, the shopper's own lines and whatever nobody asked for, and only
   * its `receipts` are kept. The other three sets it computes are the server's answer to give.
   */
  const buy = useCallback(
    async (ref: StockRef, amount: number) => {
      const scope = _scoped(householdId, "buy");
      if (!scope || amount <= 0) return;

      const at = new Date();
      const next = putInCellar(snapshot, {
        ref,
        amount,
        at,
        // Ids the server mints for the rows it owns; only the receipt's is ours to keep.
        cellarId: "",
        receiptId: `receipt-${at.getTime()}-${ref.ingredientId}:${ref.unit}`,
        historyId: "",
      });

      /**
       * The receipt is written only once the shelf actually moved. Writing it first and awaiting
       * afterwards leaves a live receipt for a purchase that never happened when the mutation
       * rejects — and the next removal peels it, sending back a `restoreToList` computed from a
       * purchase the server never saw. The undo window is five minutes; a wrong line on the list
       * outlives it.
       *
       * And it is written only if the household is still the one it was computed for. A switch
       * during the await has already emptied the receipts; writing these after it would hand this
       * household's purchase to the next one, whose cellar the undo would then peel.
       */
      const isSameHousehold = householdSession();
      await addToCellar({
        householdId: scope,
        ingredientId: _ingredient(ref.ingredientId),
        unit: ref.unit,
        quantity: amount,
      });

      if (next && isSameHousehold()) setReceipts(next.receipts);
    },
    [householdId, snapshot, setReceipts, addToCellar],
  );

  /**
   * Out of the cellar, and out of the house.
   *
   * Claims are left standing: the plates that wanted this ingredient still want it, and it is no
   * longer here, so the derived gap reopens and the list asks again. Cooking is the gesture that
   * settles a claim, and it is not this one.
   *
   * What the clock decides is what the peel gives back — and that number is the whole reason this
   * hook exists. A live receipt is unmade, so any line the purchase struck off returns; a settled
   * one is left alone, because the shopper bought that food and is now using it. The server cannot
   * work that out, so it is told, as `restoreToList`, and it performs both writes in one
   * transaction so an undo cannot half-apply.
   */
  const takeOut = useCallback(
    async (ref: StockRef, amount: number) => {
      const scope = _scoped(householdId, "remove");
      if (!scope) return;

      const owned = snapshot.cellar.find(matchesRef(ref))?.amount ?? 0;
      const taken = Math.min(amount, owned);
      if (taken <= 0) return;

      const peeled = peelReceipts(snapshot.receipts, ref, taken, new Date());

      // Same ordering rule as `buy`, failing the other way: peeling first and rejecting after
      // consumes the receipt for an undo that never happened, and the undo is then simply gone.
      // Same household check as `buy`: after a switch, these peeled receipts are the old one's.
      const isSameHousehold = householdSession();
      await takeFromCellar({
        householdId: scope,
        ingredientId: _ingredient(ref.ingredientId),
        unit: ref.unit,
        quantity: taken,
        restoreToList: peeled.restored,
        isUndo: peeled.undone > 0,
      });

      if (isSameHousehold()) setReceipts(peeled.receipts);
    },
    [householdId, snapshot.cellar, snapshot.receipts, setReceipts, takeFromCellar],
  );

  /**
   * Back onto the list, as an instruction the shopper gave rather than a plate's claim — which is
   * every line there is, until `groceryListItems` can name a meal.
   */
  const relist = useCallback(
    async (ref: StockRef, amount: number) => {
      const scope = _scoped(householdId, "relist");
      if (!scope || amount <= 0) return;

      await addToList({
        householdId: scope,
        ingredientId: _ingredient(ref.ingredientId),
        unit: ref.unit,
        quantity: amount,
      });
    },
    [householdId, addToList],
  );

  /**
   * One amount, routed by where the tap came from. Both callers go through here — the sheet, and
   * the card that skips the sheet because there was only ever one amount to pick.
   */
  const apply = useCallback(
    (intent: Intent, ref: StockRef, amount: number) => {
      if (intent === "buy") return buy(ref, amount);
      if (intent === "remove") return takeOut(ref, amount);

      return relist(ref, amount);
    },
    [buy, takeOut, relist],
  );

  /**
   * Strike an ingredient off the list, leaving the cellar and its receipts alone.
   *
   * Nothing was bought and nothing was used, so no stock moves — this is the shopper overruling
   * the list, not reporting on the house. Every line for that ingredient and unit goes, which is
   * blunt and irreversible, and deliberately so: a half-struck list is worse than an honest one.
   */
  const forceRemove = useCallback(
    async (ref: StockRef) => {
      const scope = _scoped(householdId, "forceRemove");
      if (!scope) return;

      await removeFromList({
        householdId: scope,
        ingredientId: _ingredient(ref.ingredientId),
        unit: ref.unit,
      });
    },
    [householdId, removeFromList],
  );

  /**
   * Every stock write goes out through here, so a rejected mutation lands somewhere.
   *
   * Screens wire these to `onPress`, which drops whatever the handler returns — so a rejecting
   * promise becomes an unhandled rejection and the shopper is told nothing. Resolving instead and
   * recording the failure is the smallest honest thing: the tap is already reflected on screen by
   * Convex's own reactivity, or it is not, and `error` is what a screen reads to say so once there
   * is somewhere to say it. It is not swallowed — it is held, and it is logged.
   *
   * **It reports whether the write landed**, because holding the failure is not enough for every
   * caller. A screen reads `error` and says so in its own time; `usePendingIngredients` has to
   * decide something else entirely — whether to take the ghost down — and a promise that resolves
   * identically either way told it the write succeeded. So the outcome is returned as well as held.
   */
  const guard = useCallback(
    async (run: () => Promise<void>): Promise<boolean> => {
      try {
        setError(null);
        await run();
        return true;
      } catch (cause) {
        console.error("[groceries] stock write failed", cause);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        return false;
      }
    },
    [],
  );

  return {
    apply: useCallback(
      (intent: Intent, ref: StockRef, amount: number) => guard(() => apply(intent, ref, amount)),
      [guard, apply],
    ),
    forceRemove: useCallback((ref: StockRef) => guard(() => forceRemove(ref)), [guard, forceRemove]),
    error,
  };
};
