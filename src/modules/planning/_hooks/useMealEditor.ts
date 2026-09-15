import { useAtom, useAtomValue } from "jotai";
import { useCallback, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api, type Id } from "~/lib/convex/api";
import { useConvex, useMutation } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import {
  addMeal,
  draftMealOf,
  plateIdFor,
  removeMeal,
  replaceMeal,
  setMealServings,
  startOfDay,
  type MealSlot,
} from "../_model/model";

import { draftMealsAtom, peopleAtom } from "./atoms";
import { useKeptMeal } from "./useKeptMeal";
import { useMealCatalog, type MealChoice } from "./useMealCatalog";

/**
 * What the sheet was opened on: a plate already in a week, or a slot with nothing on it.
 *
 * Two shapes rather than an optional `mealId`, because they are answered differently — the first
 * edits a plate that exists, the second has to make one before there is anything to edit.
 */
export type MealTarget =
  | { kind: "meal"; mealId: string }
  | { kind: "slot"; date: Date; slot: MealSlot };

/**
 * Which week the sheet is editing: the one the app keeps, or the one the tunnel has generated and
 * the user has not yet accepted.
 *
 * A parameter rather than a second hook, because the sheet is the same either way — portions, the
 * dish, whether the plate stays. Only where the edit lands differs: the kept week is written to
 * the server, the draft to an atom the tunnel commits later.
 */
export type MealScope = "plan" | "draft";

/**
 * One plate of a week, open for editing: its portions, the dish on it, or whether it stays.
 *
 * Reads a store rather than being handed the meal, because the sheet is a route of its own: it
 * mounts outside the tree that listed the plate — the planning screen's or the tunnel's — and
 * there is nothing to pass it but what is in its params.
 *
 * **The kept week is written to the server.** A plate opened from the plan is read and edited
 * through `useKeptMeal` (`getOne`, `setServings`, `planOne`, `removeOne`), and an empty slot of
 * the kept week is filled by `planOne` directly.
 *
 * **The draft is an atom, swapped client-side.** The tunnel's week is nothing but choices until
 * commit, so a swap is a change to the atom — but the review step draws each plate's lines and
 * their `covered` flags, and a search tile carries neither. `getDraftMeal` is asked, once, for the
 * chosen recipe as a plate weighed against the cellar, and that answer replaces the plate (or
 * fills the slot). Asked imperatively rather than subscribed: a swap is an event, and a subscribed
 * plate would reshuffle under the cook when the cellar moves.
 *
 * **Choosing a dish ends the visit**, on either week: the portions are set before the tap, on the
 * slider above the grid, and the dish is the last answer. Opened on an empty slot the sheet holds
 * portions of its own until then, so the slider has somewhere to live and the week is never given
 * a plate with no dish on it.
 */
export const useMealEditor = (target: MealTarget, scope: MealScope) => {
  const convex = useConvex();
  const locale = useLocale();
  const { householdId } = useHousehold();
  const [drafted, setDrafted] = useAtom(draftMealsAtom);

  const isKept = scope === "plan" && target.kind === "meal";
  const kept = useKeptMeal(isKept ? target.mealId : undefined);

  const people = useAtomValue(peopleAtom);
  const [query, setQuery] = useState("");

  /**
   * The portions a plate would be created for. Seeded from the household: a plate cooked for the
   * table is the answer the setup step already gave, so the common case is one nobody has to set.
   */
  const [draftServings, setDraftServings] = useState(people);

  const meal = isKept
    ? kept.meal
    : target.kind === "meal" ? drafted.find((candidate) => candidate.id === target.mealId) : undefined;

  const catalog = useMealCatalog(query, meal?.recipeId);

  const { mutate: plan } = useMutation(api.router.planning.planOne.authed);
  const [failed, setFailed] = useState(false);

  const { setServings: rescaleKept, setRecipe: swapKept, remove: removeKept } = kept;

  /**
   * Resolves whether the dish landed. The sheet closes on one that did and stays open, banner up,
   * on one the server refused — a kept plate it would not replace, or a draft read that failed.
   */
  const choose = useCallback(
    async (recipe: MealChoice): Promise<boolean> => {
      if (isKept) return swapKept(recipe.id);

      /** An empty slot of the kept week: the plate is written, and there is nothing left here to edit. */
      if (scope === "plan") {
        if (target.kind !== "slot" || !householdId) return false;

        try {
          await plan({
            householdId,
            recipeId: recipe.id as Id<"recipes">,
            date: startOfDay(target.date).getTime(),
            slot: target.slot,
            servings: draftServings,
            today: startOfDay(new Date()).getTime(),
          });
          setFailed(false);

          return true;
        } catch (error) {
          if (__DEV__) console.warn("[useMealEditor] plan failed", error);
          setFailed(true);

          return false;
        }
      }

      const plate = meal
        ? { id: meal.id, date: meal.date, slot: meal.slot, servings: meal.servings }
        : target.kind === "slot"
          ? { id: plateIdFor(target.date, target.slot), date: target.date, slot: target.slot, servings: draftServings }
          : undefined;

      /** A plate that has gone from the draft cannot be given a dish — the sheet is already leaving. */
      if (!plate || !householdId) return false;

      try {
        const answer = await convex.query(api.router.planning.getDraftMeal.authed, {
          householdId,
          recipeId: recipe.id as Id<"recipes">,
          date: startOfDay(plate.date).getTime(),
          slot: plate.slot,
          servings: plate.servings,
          today: startOfDay(new Date()).getTime(),
          locale,
        });
        const swapped = draftMealOf(answer);

        if (meal) setDrafted((current) => replaceMeal(current, meal.id, () => swapped));
        else setDrafted((current) => addMeal(current, swapped));
        setFailed(false);

        return true;
      } catch (error) {
        if (__DEV__) console.warn("[useMealEditor] draft swap failed", error);
        setFailed(true);

        return false;
      }
    },
    [isKept, swapKept, scope, target, householdId, plan, draftServings, meal, convex, locale, setDrafted],
  );

  return {
    meal,
    /** A kept plate is asked for; until the answer lands there is nothing to draw and nothing missing. */
    isLoading: kept.isLoading,
    /**
     * True only when the sheet was opened on a plate that is not there: a stale link, or the plate
     * it has just removed. An empty slot with nothing chosen yet is not missing — it is the point.
     */
    missing: isKept ? kept.isMissing : target.kind === "meal" && !meal,
    /** The server refused the last edit, and the plate is back to what it was. */
    failed: kept.failed || failed,
    servings: (isKept ? kept.servings : meal?.servings) ?? draftServings,
    /** What the grid marks as the dish already on the plate. Nothing, until one is chosen. */
    selectedRecipeId: meal?.recipeId,
    recipes: catalog.recipes,
    isSearching: catalog.isSearching,
    isStale: catalog.isStale,
    query,
    setQuery,
    choose,
    setServings: useCallback(
      (servings: number) => {
        if (isKept) return void rescaleKept(servings);
        if (!meal) return setDraftServings(servings);

        setDrafted((current) => setMealServings(current, meal.id, servings));
      },
      [isKept, rescaleKept, meal, setDrafted],
    ),
    /**
     * The plate goes, and on the kept week its claims on the grocery list go with it — `removeOne`
     * gives back what the plate put on the list and nothing else, so the shopper's own asking and
     * the other plates' claims stay.
     *
     * Resolves whether the plate actually went: the draft always does, the server can refuse — a
     * plate already cooked — and the sheet must not dismiss on a plate that is still there.
     */
    remove: useCallback(async (): Promise<boolean> => {
      if (isKept) return removeKept();
      if (!meal) return false;

      setDrafted((current) => removeMeal(current, meal.id));

      return true;
    }, [isKept, removeKept, meal, setDrafted]),
  };
};
