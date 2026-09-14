import { useCallback, useRef, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api, type Id } from "~/lib/convex/api";
import { useMutation, useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { keptMealCardOf, startOfDay, type MealCard } from "../_model/model";

/**
 * One plate of the kept week, and the two edits the server takes on it: its portions, and
 * whether it stays.
 *
 * Reads the plate itself (`getOne`) rather than taking it from the list that was tapped, because
 * the sheet is a route of its own and mounts with nothing but an id — and because the read is
 * reactive: a plate another member re-portions or removes while the sheet is open changes under
 * it rather than going stale in a copy.
 *
 * `mealId` is optional so the sheet can call this unconditionally: on the tunnel's draft, or on an
 * empty slot, there is no kept plate and the query is skipped.
 */
export const useKeptMeal = (mealId: string | undefined) => {
  const locale = useLocale();
  const { householdId } = useHousehold();

  const enabled = !!householdId && !!mealId;

  const { status, data } = useQueryCached(
    api.router.planning.getOne.authed,
    enabled ? { householdId, locale, mealId: mealId as Id<"plannedMeals"> } : "skip",
  );

  const { mutate: rescale } = useMutation(api.router.planning.setServings.authed);
  const { mutate: drop } = useMutation(api.router.planning.removeOne.authed);

  /**
   * The portions the slider shows while the server has not yet agreed to them. A step slider fires
   * once per position crossed, so a drag from two to six is four writes in flight; the thumb reads
   * this until the LAST of them settles, or it would jump back to the server's value between two.
   */
  const [pending, setPending] = useState<number>();
  const inFlight = useRef(0);

  const [failed, setFailed] = useState(false);

  const meal: MealCard | undefined = data ? keptMealCardOf(data) : undefined;

  const setServings = useCallback(
    async (servings: number) => {
      if (!householdId || !mealId) return;

      const ticket = ++inFlight.current;
      setPending(servings);

      try {
        await rescale({
          householdId,
          mealId: mealId as Id<"plannedMeals">,
          servings,
          /** Only there to say which meals still hold stock, and the honest answer is today, now. */
          today: startOfDay(new Date()).getTime(),
        });
        setFailed(false);
      } catch (error) {
        if (__DEV__) console.warn("[useKeptMeal] setServings failed", error);
        setFailed(true);
      } finally {
        // A failed or superseded write hands the slider back to the server's value, not to its own.
        if (ticket === inFlight.current) setPending(undefined);
      }
    },
    [householdId, mealId, rescale],
  );

  /**
   * Resolves `false` rather than throwing, because the caller is the sheet's delete action and it
   * must only dismiss on a plate that actually went: closing on a refused write would hide both the
   * plate and the reason it is still there.
   */
  const remove = useCallback(async (): Promise<boolean> => {
    if (!householdId || !mealId) return false;

    try {
      await drop({ householdId, mealId: mealId as Id<"plannedMeals">, today: startOfDay(new Date()).getTime() });
      setFailed(false);

      return true;
    } catch (error) {
      if (__DEV__) console.warn("[useKeptMeal] remove failed", error);
      setFailed(true);

      return false;
    }
  }, [householdId, mealId, drop]);

  return {
    meal,
    servings: pending ?? meal?.servings,
    /** Until the first answer lands. Skipped is not loading: there is no plate being asked about. */
    isLoading: enabled && status === "pending",
    /**
     * The plate is not there to edit: gone, or not this household's to read. Both end the same way
     * for the sheet, which has nothing to draw either way.
     */
    isMissing: enabled && (status === "error" || (status === "success" && data === null)),
    /** The last write was refused, and the plate is as the server last had it. */
    failed,
    setServings,
    remove,
  };
};
