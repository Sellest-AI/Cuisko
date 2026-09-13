import { useAtomValue } from "jotai";
import { useCallback } from "react";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { ownedLinesOf, startOfDay } from "../_model/model";
import { draftMealsAtom, noteAtom, ownedRowsAtom, peopleAtom, shuffleSeedAtom } from "./atoms";

/**
 * The model keys a line by ingredient id and knows nothing about which table it came from — that is
 * what lets `_model/` be tested without a database. Convex wants the branded type back at the seam.
 */
const _ingredient = (id: string) => id as Id<"ingredients">;

/**
 * Keeps the week the user has just been shown, and the shopping it implies.
 *
 * **Only the choices go up.** Which dish on which day, for how many, the run's seed and note, and
 * the rows the shopper ticked as already in the kitchen — every quantity is recomputed server-side
 * against the cellar as it stands at that moment (`commitPlan`). The draft's own amounts are what the
 * review step was drawn from, and a cellar somebody emptied in between must not be planned against.
 *
 * `today` is read at commit time rather than pinned with the draft: it is only there to say which
 * planned meals still hold stock, and the honest answer to that is today, now.
 *
 * It resolves `false` rather than throwing, because the only caller is a button in the tunnel bar and
 * a failed write must leave the user on the step with their week intact, not advance them past it.
 */
export const usePlanCommit = () => {
  const { householdId } = useHousehold();
  const meals = useAtomValue(draftMealsAtom);
  const ownedRows = useAtomValue(ownedRowsAtom);
  const people = useAtomValue(peopleAtom);
  const note = useAtomValue(noteAtom);
  const seed = useAtomValue(shuffleSeedAtom);

  const { mutate, isLoading } = useMutation(api.router.planning.commit.authed);

  const commit = useCallback(async (): Promise<boolean> => {
    // No household, no week to keep; no plate, nothing to keep. Neither is a failure to report.
    if (!householdId || meals.length === 0) return true;

    try {
      await mutate({
        householdId,
        people,
        /**
         * A draft cannot exist without the roll that drew it — the generating step sets both — so
         * this fallback is unreachable. `0` and not a fresh roll if it ever is reached: the field
         * records which shuffle produced this week, and inventing one would record a week that
         * never happened rather than an honest "the start of the range".
         */
        seed: seed ?? 0,
        note: note.trim() || undefined,
        today: startOfDay(new Date()).getTime(),
        plates: meals.map((meal) => ({
          recipeId: meal.recipeId as Id<"recipes">,
          date: startOfDay(meal.date).getTime(),
          slot: meal.slot,
          servings: meal.servings,
        })),
        owned: ownedLinesOf(meals, ownedRows).map((line) => ({
          ingredientId: _ingredient(line.ingredientId),
          unit: line.unit,
        })),
      });

      return true;
    } catch (error) {
      if (__DEV__) console.warn("[usePlanCommit] commit failed", error);

      return false;
    }
  }, [householdId, meals, people, seed, note, ownedRows, mutate]);

  return { commit, isSaving: isLoading };
};
