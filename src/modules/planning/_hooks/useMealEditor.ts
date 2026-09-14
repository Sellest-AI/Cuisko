import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";

import {
  addMeal,
  matchesQuery,
  plannedMealOf,
  plateIdFor,
  removeMeal,
  replaceMeal,
  setMealServings,
  type MealSlot,
  type Plate,
  type Recipe,
} from "../_model/model";

import { draftMealsAtom, peopleAtom, planMealsAtom } from "./atoms";
import { draftMealOf, RECIPE_CATALOGUE } from "./placeholders";
import { useKeptMeal } from "./useKeptMeal";

/**
 * What the sheet was opened on: a plate already in the plan, or a slot with nothing on it.
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
 * A parameter rather than a second hook, because the editing is identical either way — a plate is
 * swapped, emptied or re-portioned the same regardless of which week holds it. Only the store
 * differs, so only the store is chosen here.
 */
export type MealScope = "plan" | "draft";

/** One week's plates and the four edits the sheet makes to them, whatever shape its plates are. */
type Store = {
  meals: (Plate & { recipeId: string })[];
  add: (plate: Plate, recipe: Recipe) => void;
  replace: (mealId: string, recipe: Recipe) => void;
  setServings: (mealId: string, servings: number) => void;
  remove: (mealId: string) => void;
};

/**
 * The edits, bound to one week's setter and to the builder that turns a recipe into its kind of plate.
 *
 * Generic here and nowhere else: the kept week holds `PlannedMeal`s and the draft `DraftMeal`s, and
 * this is where each is told apart once, so the hook below reads a single `Store`.
 */
const _storeOf = <M extends Plate & { recipeId: string }>(
  meals: M[],
  setMeals: (update: (current: M[]) => M[]) => void,
  plated: (plate: Plate, recipe: Recipe) => M,
): Store => ({
  meals,
  add: (plate, recipe) => setMeals((current) => addMeal(current, plated(plate, recipe))),
  replace: (mealId, recipe) => setMeals((current) => replaceMeal(current, mealId, (plate) => plated(plate, recipe))),
  setServings: (mealId, servings) => setMeals((current) => setMealServings(current, mealId, servings)),
  remove: (mealId) => setMeals((current) => removeMeal(current, mealId)),
});

/**
 * One plate of a week, open for editing: its portions, the dish on it, or whether it stays.
 *
 * Reads a store rather than being handed the meal, because the sheet is a route of its own: it
 * mounts outside the tree that listed the plate — the planning screen's or the tunnel's — and
 * there is nothing to pass it but what is in its params.
 *
 * **A kept plate is read from and written to the server** (`useKeptMeal`): the week the app keeps
 * lives in Convex, and re-portioning or removing a plate has to move the grocery list with it. The
 * draft is still an atom — nothing is agreed to until the tunnel commits — and so, for now, is a
 * plate minted on an empty slot of the kept week, which `planOne` (the next slice) will write.
 *
 * Opened on an empty slot it holds a draft instead: no plate exists until a dish is chosen, so the
 * portions have somewhere to live in the meantime and the plan is not given a plate with no dish
 * on it. Choosing creates the plate and the sheet goes on editing that one, which is what makes
 * "pick a dish, then set the portions" one visit rather than two.
 */
export const useMealEditor = (target: MealTarget, scope: MealScope) => {
  /** All read, so the hook calls are unconditional; only the chosen one is edited. */
  const [planned, setPlanned] = useAtom(planMealsAtom);
  const [drafted, setDrafted] = useAtom(draftMealsAtom);

  const isKept = scope === "plan" && target.kind === "meal";
  const kept = useKeptMeal(isKept ? target.mealId : undefined);

  const store = useMemo(
    () => (scope === "draft"
      ? _storeOf(drafted, setDrafted, draftMealOf)
      : _storeOf(planned, setPlanned, plannedMealOf)),
    [scope, drafted, setDrafted, planned, setPlanned],
  );

  const { meals } = store;
  const people = useAtomValue(peopleAtom);
  const [query, setQuery] = useState("");

  /** The plate this sheet created, so a second tap edits it rather than making another. */
  const [createdId, setCreatedId] = useState<string>();

  /**
   * The portions a plate would be created for. Seeded from the household: a plate cooked for the
   * table is the answer the setup step already gave, so the common case is one nobody has to set.
   */
  const [draftServings, setDraftServings] = useState(people);

  const mealId = target.kind === "meal" ? target.mealId : createdId;
  const meal = isKept ? kept.meal : meals.find((candidate) => candidate.id === mealId);

  const recipes = useMemo(
    () => RECIPE_CATALOGUE
      .filter((recipe) => matchesQuery(recipe.title, query))
    , [query],
  );

  const choose = useCallback(
    (recipe: Recipe) => {
      /**
       * The grid is a placeholder until the search-engine slice replaces it, and a kept plate has no
       * server operation to swap its dish yet — so on one, a tap chooses nothing rather than writing
       * an invented recipe into an atom nothing reads.
       */
      if (isKept) return;

      if (meal) return store.replace(meal.id, recipe);

      /** A plate that has gone from the plan cannot be given a dish — the sheet is already leaving. */
      if (target.kind !== "slot") return;

      const plate = {
        id: plateIdFor(target.date, target.slot),
        date: target.date,
        slot: target.slot,
        servings: draftServings,
      };

      store.add(plate, recipe);
      setCreatedId(plate.id);
    },
    [isKept, meal, target, draftServings, store],
  );

  const { setServings: rescaleKept, remove: removeKept } = kept;

  return {
    meal,
    /** A kept plate is asked for; until the answer lands there is nothing to draw and nothing missing. */
    isLoading: kept.isLoading,
    /**
     * True only when the sheet was opened on a plate that is not there: a stale link, or the plate
     * it has just removed. An empty slot with nothing chosen yet is not missing — it is the point.
     */
    missing: isKept ? kept.isMissing : mealId !== undefined && !meal,
    /** The server refused the last edit of a kept plate, which is back to what it was. */
    failed: kept.failed,
    servings: (isKept ? kept.servings : meal?.servings) ?? draftServings,
    /** What the grid marks as the dish already on the plate. Nothing, until one is chosen. */
    selectedRecipeId: meal?.recipeId,
    recipes,
    query,
    setQuery,
    choose,
    setServings: useCallback(
      (servings: number) => {
        if (isKept) return void rescaleKept(servings);
        if (!meal) return setDraftServings(servings);

        store.setServings(meal.id, servings);
      },
      [isKept, rescaleKept, meal, store],
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

      store.remove(meal.id);

      return true;
    }, [isKept, removeKept, meal, store]),
  };
};
