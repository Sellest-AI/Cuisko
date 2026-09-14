import { useCallback, useMemo, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api, type Id } from "~/lib/convex/api";
import { useMutation, useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import {
  addDays,
  isSameDay,
  keptMealCardOf,
  MAX_SERVINGS,
  startOfDay,
  type MealCard,
  type MealSlot,
} from "../_model/model";

/** Today and the eight days after it: the nine tiles of the "when do you want to cook this?" grid. */
export const PLANNABLE_DAYS = 9;

/** One tile of the grid: a day, and the plate already on it at the chosen slot, if any. */
export type PlannableDay = {
  date: Date;
  meal?: MealCard;
};

type Args = {
  recipeId: string;
  /**
   * The portions the sheet opens on. Seeded rather than fixed because the ingredients tab has a
   * stepper the cook has most likely already set; the sheet asks again only so it can be changed
   * without going back. `undefined` while the recipe is still loading — the slider waits for it.
   */
  initialServings?: number;
};

/** The slider cannot ask for a half portion, but a route param could; one plate is the floor. */
const _clampServings = (servings: number) => Math.min(Math.max(Math.round(servings), 1), MAX_SERVINGS);

/**
 * Putting one recipe on one plate of the kept week — the recipe screen's "add to my list".
 *
 * Reads the nine days the grid offers (`getMany`, one range read) and splits them by the chosen
 * slot on the client, so switching lunch to dinner swaps the plates drawn without a second read.
 * The plate on a tile is what `plan` would replace: the sheet shows it and asks before calling.
 *
 * `plan` resolves `false` rather than throwing, because the only caller is a tile in a sheet and a
 * refused write — a plate already cooked on that slot — must leave the sheet open saying so, not
 * dismiss it as if the plate had landed.
 */
export const usePlanRecipe = ({ recipeId, initialServings }: Args) => {
  const locale = useLocale();
  const { householdId } = useHousehold();

  /** One "today" per mount, at midnight, so the tiles keep their identity across renders. */
  const [today] = useState(() => startOfDay(new Date()));
  const dates = useMemo(
    () => Array.from({ length: PLANNABLE_DAYS }, (_, index) => addDays(today, index)),
    [today],
  );

  /** `to` is exclusive: the midnight after the grid's last day. */
  const { data, status } = useQueryCached(
    api.router.planning.getMany.authed,
    householdId
      ? { householdId, locale, from: today.getTime(), to: addDays(today, PLANNABLE_DAYS).getTime() }
      : "skip",
  );

  const [slot, setSlot] = useState<MealSlot>("lunch");

  /** `undefined` until the cook moves the slider, so the seed keeps winning while it is still loading. */
  const [chosenServings, setChosenServings] = useState<number>();
  const servings = chosenServings ?? (initialServings === undefined ? undefined : _clampServings(initialServings));

  const days: PlannableDay[] = useMemo(() => {
    const meals = (data ?? []).map(keptMealCardOf);

    return dates.map((date) => ({
      date,
      meal: meals.find((meal) => meal.slot === slot && isSameDay(meal.date, date)),
    }));
  }, [dates, data, slot]);

  const { mutate, isLoading: isSaving } = useMutation(api.router.planning.planOne.authed);
  const [failed, setFailed] = useState(false);

  const plan = useCallback(
    async (date: Date): Promise<boolean> => {
      if (!householdId || servings === undefined) return false;

      try {
        await mutate({
          householdId,
          recipeId: recipeId as Id<"recipes">,
          date: startOfDay(date).getTime(),
          slot,
          servings,
          /** Only there to say which plates still hold stock, and the honest answer is today, now. */
          today: startOfDay(new Date()).getTime(),
        });
        setFailed(false);

        return true;
      } catch (error) {
        if (__DEV__) console.warn("[usePlanRecipe] plan failed", error);
        setFailed(true);

        return false;
      }
    },
    [householdId, recipeId, slot, servings, mutate],
  );

  return {
    days,
    slot,
    setSlot,
    servings,
    setServings: useCallback((next: number) => setChosenServings(_clampServings(next)), []),
    plan,
    isSaving,
    /** The server refused the last plate, and the grid is as it was. */
    failed,
    /** The week is being asked for; the tiles cannot say what they would replace until it lands. */
    isLoading: !!householdId && status === "pending",
  };
};
