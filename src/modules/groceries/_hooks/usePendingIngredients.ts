import { useAtom } from "jotai";
import { useCallback } from "react";

import { pickQuantity, type Unit } from "@shared/ingredients";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

import { pendingIngredientsAtom } from "./atoms";
import { useStockActions } from "./useStockActions";
import type { PendingFailure, PendingIntent, StockRef } from "../_model/model";

/** Enough for a list that only ever holds a handful of live ghosts. */
const _mintId = () => `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

/**
 * The placeholder a shopper sees while the server works out what they typed.
 *
 * **Ghost first, resolve second, list third**, and that order is the point. The resolve can take
 * seconds — a taxonomy lookup, two outbound fetches and a model call in the worst case — and a bar
 * that showed nothing for that long is a bar that ate the word. So the ghost goes up on the
 * gesture, and every later step either replaces it with a real line or turns it into something the
 * shopper can read.
 *
 * **The resolve is awaited and its throw is caught here.** `resolve.authed` refuses a term it read
 * and could make nothing of, but *throws* when the model could not answer at all — see its router
 * doc. Those are different cards, and this is the only place that can still tell them apart: one
 * step further out the promise is gone.
 *
 * Adding the line is `useStockActions.apply`, unchanged. The resolver returns an id and never
 * touches the list, so what the ingredient becomes — stock in the cellar or a line to buy — is
 * still the caller's `intent`, exactly as it is for an ingredient the catalog already held.
 *
 * **`unit` and `amount` arrive nullable, and that is the point.** The navigation bar knows what
 * the shopper TYPED and nothing about the food, so a blank left there used to be filled with one
 * piece of it before anyone could object — which is how "gnocchis" became a single gnocchi and
 * "crème de marrons" a single crème. The blank travels instead, and is filled here, because here
 * is the first moment a row exists to read the answer off.
 */
export const usePendingIngredients = () => {
  const [pending, setPending] = useAtom(pendingIngredientsAtom);
  const locale = useLocale();
  const { apply } = useStockActions();
  const { action: resolve } = useAction(api.router.ingredients.resolve.authed);

  const _drop = useCallback(
    (id: string) => setPending((ghosts) => ghosts.filter((ghost) => ghost.id !== id)),
    [setPending],
  );

  const _fail = useCallback(
    (id: string, reason: PendingFailure) =>
      setPending((ghosts) =>
        ghosts.map((ghost) =>
          ghost.id === id ? { ...ghost, state: "failed" as const, reason } : ghost,
        ),
      ),
    [setPending],
  );

  const add = useCallback(
    async (text: string, intent: PendingIntent, unit: Unit | null, amount: number | null) => {
      const name = text.trim();
      if (!name) return;

      const id = _mintId();
      // The intent is stored, not just closed over: it decides which section draws the card while
      // it resolves, and the card has to be under the heading the shopper aimed it at.
      //
      // The ghost carries only what the shopper actually said. A quantity guessed now is a
      // quantity that changes under them a second later, when the real one arrives — worse than a
      // card that simply does not claim one yet.
      // `?? undefined` because the ghost's own type already says both are optional — it was
      // written for a card that does not know yet, which is exactly what this is.
      setPending((ghosts) => [
        ...ghosts,
        { id, name, unit: unit ?? undefined, amount: amount ?? undefined, intent, state: "resolving" },
      ]);

      let resolved;
      try {
        resolved = await resolve({ text: name, locale });
      } catch {
        // The resolve never returned a judgement, so the card must not claim one was made. The
        // ghost stays on screen as a failure the shopper can dismiss and retype.
        _fail(id, "error");
        return;
      }

      if (resolved.status === "refused") {
        _fail(id, resolved.reason);
        return;
      }

      // What the shopper typed wins, and both halves travel together — `pickQuantity` is why an
      // amount typed without a unit does not get the row's unit bolted onto it. Both arms that
      // produce a row carry the defaults — see `ResolvedIngredient`.
      const quantity = pickQuantity({ amount, unit }, resolved);
      const ref: StockRef = { ingredientId: resolved.ingredientId, unit: quantity.unit };

      // The line lands before the ghost goes, never after: dropping first leaves a gap on the list
      // for however long the mutation takes, and the card the shopper was watching flickers out
      // and back in a different section.
      //
      // And the ghost goes only if the line actually landed. `apply` holds its own failure rather
      // than throwing, so dropping unconditionally took the card down on a rejected write and left
      // the shopper with no line, no ghost and nothing said — the one outcome this whole hook
      // exists to prevent. A write that failed is our failure, not their word: same card as a
      // resolve that never returned.
      if (!(await apply(intent, ref, quantity.amount))) {
        _fail(id, "error");
        return;
      }

      _drop(id);
    },
    [_drop, _fail, apply, locale, resolve, setPending],
  );

  /** The shopper striking off a ghost that failed. There is nothing to delete but this atom. */
  const dismiss = useCallback((id: string) => _drop(id), [_drop]);

  return { pending, add, dismiss };
};
