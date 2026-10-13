import { formatGroceryQuantity } from "@shared/ingredients";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { useUnitLabel } from "~/hooks/useUnitLabel";
import { api } from "~/lib/convex/api";
import type { Id } from "~/lib/convex/api";
import { useMutation, useQuery } from "~/lib/convex/client";

import type { DrawnCellarChange } from "../_model/chatMessage";
import { undoneChangesAtom } from "./atoms";

/** One empty list for every change nothing was undone in, so `pending` does not recompute each render. */
const NONE_UNDONE: readonly number[] = [];

export type CellarChangeCard = {
  key: string;
  name: string;
  emoji: string;
  imageUrl?: string;
  /** Already formatted, "500 g". */
  quantity: string;
};

/**
 * One cellar change Cuisko made: its lines as cards, and the undo.
 *
 * **The undo replays each line the other way, one mutation per line**, through the same public
 * mutations the groceries screen uses: what an add put on the shelf comes off with what it struck
 * off the list (ADR 0009, the receipt decides), and what a removal took goes back without striking
 * anything, since nothing was bought.
 *
 * **Which lines are undone lives in `undoneChangesAtom`, under `changeKey`**, so closing and
 * reopening the chat does not offer an undo already made; killing the app does forget it. For an
 * add, the rows it landed on are also checked against the cellar: once one is gone, the stock it
 * held is gone with it, and there is nothing left to take back. A removal has no such check, since
 * the rows it emptied are gone by design.
 *
 * The lines are undone one by one and a failed one stays offered, so a second press retries only
 * what did not go through, instead of replaying lines already taken back.
 *
 * The ids are cast as `useAssistantSubstitutions` casts them: they came out of a tool that wrote
 * them, and the chat smodel checked their shape before they got here.
 *
 * @limitation Undoing a removal that emptied a row puts the stock back on a new row, dated fresh
 * from the ingredient's shelf life: the old date went with the row. Accepted: it takes an undo of a
 * removal that took the last of something, and a cellar reading "keeps longer" ranks it lower for a
 * while, the same family as `_mergedExpiration`'s own limitation in `addToCellar`.
 */
export const useCellarChange = (change: DrawnCellarChange, changeKey: string) => {
  const locale = useLocale();
  const unitLabel = useUnitLabel();
  const householdId = change.householdId as Id<"households">;

  const [undoneAll, setUndoneAll] = useAtom(undoneChangesAtom);
  const undoneLines = undoneAll[changeKey] ?? NONE_UNDONE;
  const [isUndoing, setIsUndoing] = useState(false);

  const { mutate: addToCellar } = useMutation(api.router.cellars.addToCellar.authed);
  const { mutate: removeFromCellar } = useMutation(api.router.cellars.removeFromCellar.authed);

  const ingredientIds = useMemo(
    () => [...new Set(change.lines.map((line) => line.ingredientId))] as Id<"ingredients">[],
    [change],
  );

  const found = useQuery(api.router.ingredients.list.anon, { ids: ingredientIds, locale });
  const cellar = useQuery(
    api.router.cellars.getCellar.authed,
    change.action === "add" ? { householdId } : "skip",
  );

  const cards = useMemo((): CellarChangeCard[] => {
    const rows = new Map((found.data ?? []).map((row) => [row._id as string, row]));

    return change.lines.flatMap((line, index) => {
      const row = rows.get(line.ingredientId);

      return row
        ? [{
          key: `${index}-${line.ingredientId}`,
          name: row.name,
          emoji: row.emoji,
          imageUrl: row.image?.sizes.thumbnail?.url,
          quantity: formatGroceryQuantity(line.quantity, line.unit, unitLabel),
        }]
        : [];
    });
  }, [change, found.data, unitLabel]);

  const pending = useMemo(() => {
    const undone = new Set(undoneLines);
    return change.lines.flatMap((line, index) => (undone.has(index) ? [] : [{ line, index }]));
  }, [change, undoneLines]);

  const rowsStillThere = useMemo(() => {
    if (change.action === "remove") return true;
    if (!cellar.data) return false;

    const rowIds = new Set(cellar.data.map((row) => row._id as string));
    return pending.every(({ line }) => rowIds.has(line.cellarItemId));
  }, [change.action, cellar.data, pending]);

  const undo = useCallback(async () => {
    setIsUndoing(true);

    for (const { line, index } of pending) {
      const ingredientId = line.ingredientId as Id<"ingredients">;

      try {
        if (change.action === "add") {
          await removeFromCellar({
            householdId,
            ingredientId,
            unit: line.unit,
            quantity: line.quantity,
            restoreToList: line.restoreToList,
            isUndo: true,
          });
        } else {
          await addToCellar({ householdId, ingredientId, unit: line.unit, quantity: line.quantity, strikeList: false });
        }

        // Recorded line by line, as each lands: a modal closed mid-undo must not lose the lines
        // already taken back, or reopening would offer them again.
        setUndoneAll((all) => ({ ...all, [changeKey]: [...(all[changeKey] ?? []), index] }));
      } catch (error) {
        // Left pending, so the pill stays offered and the next press retries this line alone.
        if (__DEV__) console.warn(`[useCellarChange] undo of ${line.ingredientId} failed`, error);
      }
    }

    setIsUndoing(false);
  }, [addToCellar, change.action, changeKey, householdId, pending, removeFromCellar, setUndoneAll]);

  return {
    cards,
    /** Only the first load, like the recipe cards. */
    isLoading: found.data === undefined,
    canUndo: pending.length > 0 && rowsStillThere,
    isUndoing,
    undo,
  };
};
