import type { MealPlanned } from "@shared/assistant";
import { localClock } from "@shared/clock";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api, type Id } from "~/lib/convex/api";
import { useMutation, useQuery } from "~/lib/convex/client";

import { undoneChangesAtom } from "./atoms";

/** The one line a planned plate has, in `undoneChangesAtom`'s terms. */
const PLATE = 0;

export type PlannedMealCard = {
  title: string;
  imageUrl?: string;
  minutes?: number;
};

/**
 * One plate Cuisko planned: the card, and the undo.
 *
 * **The undo takes the plate off, then puts back the plate it replaced**, through the same public
 * mutations the meal sheet uses: `removeOne` gives its claims back to the list, and `planOne` plans
 * the replaced dish again on the same day and slot, which lists what it needs again.
 *
 * **The card is the recipe's, the undo the plate's.** The recipe draws the card, so an undone plate
 * still shows what it was; the plate is read from the week (`getOne`) only to know whether it can
 * still be undone: gone, cooked or skipped, and there is nothing left to take back. Whether the undo
 * was already made lives in `undoneChangesAtom`, so reopening the chat does not offer it again.
 *
 * Read in the household the plate was planned in, not the current one: the conversation outlives
 * a household switch (`CellarChange.householdId`).
 *
 * @limitation The undo is recorded once the plate is off. If putting back the replaced plate then
 * fails, it is logged and not retried: the pill is gone with the plate. Accepted: it takes the
 * replaced recipe being deleted in the meantime, and the cook can plan it again from its screen.
 */
export const usePlannedMeal = (meal: MealPlanned, changeKey: string) => {
  const locale = useLocale();
  const householdId = meal.householdId as Id<"households">;
  const mealId = meal.plannedMealId as Id<"plannedMeals">;

  const [undoneAll, setUndoneAll] = useAtom(undoneChangesAtom);
  const isUndone = undoneAll[changeKey]?.includes(PLATE) ?? false;
  const [isUndoing, setIsUndoing] = useState(false);

  // The recipe draws the card, so it stays once the plate is gone; the plate only says whether the
  // undo still has something to take back.
  const recipes = useQuery(api.router.recipes.getMany.authed, { ids: [meal.recipeId as Id<"recipes">], locale });
  const plate = useQuery(api.router.planning.getOne.authed, { householdId, locale, mealId });
  const { mutate: drop } = useMutation(api.router.planning.removeOne.authed);
  const { mutate: plan } = useMutation(api.router.planning.planOne.authed);

  const recipe = recipes.data?.[0];
  const card: PlannedMealCard | undefined = recipe
    ? { title: recipe.title, imageUrl: recipe.plateImageUrl, minutes: recipe.minutes }
    : undefined;

  const isStillPlanned = plate.data?.status === "ready" || plate.data?.status === "shopping-needed";

  const undo = useCallback(async () => {
    setIsUndoing(true);
    const { today } = localClock(new Date());

    try {
      await drop({ householdId, mealId, today });
      setUndoneAll((all) => ({ ...all, [changeKey]: [PLATE] }));

      if (meal.replaced) {
        await plan({
          householdId,
          recipeId: meal.replaced.recipeId as Id<"recipes">,
          date: meal.date,
          slot: meal.slot,
          servings: meal.replaced.servings,
          today,
        });
      }
    } catch (error) {
      if (__DEV__) console.warn("[usePlannedMeal] undo failed", error);
    } finally {
      setIsUndoing(false);
    }
  }, [changeKey, drop, householdId, meal, mealId, plan, setUndoneAll]);

  return {
    card,
    date: new Date(meal.date),
    slot: meal.slot,
    servings: meal.servings,
    /** Only the first load of the recipe, like the recipe cards. */
    isLoading: recipes.data === undefined,
    /**
     * The plate Cuisko wrote is no longer on the week: undone here, removed from the planning screen,
     * or replaced by another dish, which is a new plate. `null` is the week's answer for a plate that
     * is gone; `undefined` is still loading, and not canceled. A cooked or re-portioned plate is the
     * same plate, so it is not canceled either.
     */
    isCanceled: isUndone || plate.data === null,
    /**
     * Only while the undo can restore everything: a day that has passed cannot be planned again, so
     * undoing there would take the plate off and never put back the one it replaced.
     */
    canUndo: !isUndone && isStillPlanned && meal.date >= localClock(new Date()).today,
    isUndoing,
    undo,
  };
};
