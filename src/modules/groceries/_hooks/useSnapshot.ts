import { NO_EMOJI } from "@shared/ingredients";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api, type Doc } from "~/lib/convex/api";
import { useQueryCached, useQueryHeld } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { receiptsAtom } from "./atoms";
import type { CellarEntry, GroceryLine, HistoryEntry, Ingredient, Snapshot } from "../_model/model";
import { useLiveWindow } from "./useLiveWindow";

/**
 * The database rows, in the shapes `model.ts` reads.
 *
 * Three small mappings rather than one shared one: the tables agree on `quantity` but disagree on
 * what their timestamp *means* — when the line was written, when the shelf last moved, when the
 * household last dealt in it — and flattening that into one helper would hide the difference at
 * exactly the place a reader needs to see it.
 *
 * `_creationTime` is what a grocery line's `createdAt` was always going to be; the model has said
 * so since before there was a table.
 */
const _toLine = (row: Doc<"groceryListItems">): GroceryLine => ({
  id: row._id,
  ingredientId: row.ingredientId,
  amount: row.quantity,
  unit: row.unit,
  createdAt: new Date(row._creationTime),
});

const _toCellarEntry = (row: Doc<"cellarItems">): CellarEntry => ({
  id: row._id,
  ingredientId: row.ingredientId,
  unit: row.unit,
  amount: row.quantity,
  updatedAt: new Date(row.updatedAt),
});

const _toHistoryEntry = (row: Doc<"recentlyUsedIngredients">): HistoryEntry => ({
  id: row._id,
  ingredientId: row.ingredientId,
  unit: row.unit,
  amount: row.quantity,
  at: new Date(row.updatedAt),
});

const EMPTY: never[] = [];

/**
 * Everything the pure functions in `model.ts` read, as one value — the four sets plus the clock
 * the undo window is measured against.
 *
 * Three of the sets are the household's, and come from Convex. The fourth is `receipts`, which is
 * this session's alone (see `atoms.ts`). The clock is nobody's: each caller keeps its own and
 * wakes itself at the next expiry, so the grid and the quantity modal stay correct independently
 * rather than in step.
 *
 * **Names arrive separately, and by id.** The three household tables store `ingredientId` and
 * nothing else, so the catalog is asked for exactly the rows on screen rather than all ~200 —
 * which also means one query re-runs when the list changes, instead of the whole catalog being
 * held in memory to answer a dozen lookups.
 *
 * **No line carries a plate yet.** `groceryListItems` has no meal column, so every line reads as
 * one the shopper wrote themselves — an instruction rather than a claim. `claimed` is therefore 0
 * and `toBuy` is the plain total until the recipe→grocery link is built. The distinction is kept
 * in the model, not dropped, because that link is what it is for.
 */
export const useSnapshot = (): Snapshot & { isLoading: boolean } => {
  const locale = useLocale();
  const { householdId, isLoading: isResolvingHousehold } = useHousehold();

  /** One argument for all three, and `'skip'` until there is a household to scope them to. */
  const scope = householdId ? { householdId } : "skip";

  const lines = useQueryCached(api.router.cellars.getGroceryList.authed, scope);
  const cellar = useQueryCached(api.router.cellars.getCellar.authed, scope);
  const history = useQueryCached(api.router.cellars.getRecentlyUsed.authed, scope);

  const ids = useMemo(() => {
    const rows = [...(lines.data ?? []), ...(cellar.data ?? []), ...(history.data ?? [])];

    return [...new Set(rows.map((row) => row.ingredientId))];
  }, [lines.data, cellar.data, history.data]);

  /**
   * Held, not merely cached. `ids` changes as a *consequence* of the rows on screen changing, so
   * every add and remove re-keys this query — and `buildSections` drops a row whose ingredient it
   * cannot name, which would empty the whole grid for a round trip on each one.
   */
  const ingredients = useQueryHeld(
    api.router.ingredients.list.anon,
    ids.length > 0 ? { ids, locale } : "skip",
  );

  const receipts = useAtomValue(receiptsAtom);
  const now = useLiveWindow(receipts);

  return useMemo(
    () => ({
      ingredients: (ingredients.data ?? EMPTY).map(
        (row): Ingredient => ({ id: row._id, name: row.name, emoji: row.emoji ?? NO_EMOJI }),
      ),
      lines: (lines.data ?? EMPTY).map(_toLine),
      cellar: (cellar.data ?? EMPTY).map(_toCellarEntry),
      receipts,
      history: (history.data ?? EMPTY).map(_toHistoryEntry),
      now,
      /**
       * The names are not waited for: `useQueryHeld` keeps the previous ones on screen while the
       * next set loads, so a row never goes unnamed once it has been named.
       *
       * Scoped on `householdId` rather than on the three `isPending` flags, because a skipped
       * query reports itself as pending — a signed-in user with no household yet would otherwise
       * load forever rather than being sent to onboarding.
       */
      isLoading: isResolvingHousehold || (!!householdId && (lines.isPending || cellar.isPending || history.isPending)),
    }),
    [ingredients.data, lines.data, lines.isPending, cellar.data, cellar.isPending, history.data, history.isPending, receipts, now, isResolvingHousehold, householdId],
  );
};
