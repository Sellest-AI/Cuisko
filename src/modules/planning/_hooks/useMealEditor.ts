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
 * Reads and writes an atom rather than being handed the meal, because the sheet is a route of its
 * own: it mounts outside the tree that listed the plate — the planning screen's or the tunnel's —
 * and there is nothing to pass it but what is in its params.
 *
 * Opened on an empty slot it holds a draft instead: no plate exists until a dish is chosen, so the
 * portions have somewhere to live in the meantime and the plan is not given a plate with no dish
 * on it. Choosing creates the plate and the sheet goes on editing that one, which is what makes
 * "pick a dish, then set the portions" one visit rather than two.
 */
export const useMealEditor = (target: MealTarget, scope: MealScope) => {
  /** Both read, so the hook calls are unconditional; only the chosen one is edited. */
  const [planned, setPlanned] = useAtom(planMealsAtom);
  const [drafted, setDrafted] = useAtom(draftMealsAtom);

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
  const meal = meals.find((candidate) => candidate.id === mealId);

  const recipes = useMemo(
    () => RECIPE_CATALOGUE
      .filter((recipe) => matchesQuery(recipe.title, query))
    , [query],
  );

  const choose = useCallback(
    (recipe: Recipe) => {
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
    [meal, target, draftServings, store],
  );

  return {
    meal,
    /**
     * True only when the sheet was opened on a plate that is not there: a stale link, or the plate
     * it has just removed. An empty slot with nothing chosen yet is not missing — it is the point.
     */
    missing: mealId !== undefined && !meal,
    servings: meal?.servings ?? draftServings,
    /** What the grid marks as the dish already on the plate. Nothing, until one is chosen. */
    selectedRecipeId: meal?.recipeId,
    recipes,
    query,
    setQuery,
    choose,
    setServings: useCallback(
      (servings: number) => {
        if (!meal) return setDraftServings(servings);

        store.setServings(meal.id, servings);
      },
      [meal, store],
    ),
    /**
     * The plate goes — and, for now, only the plate.
     *
     * Its claims on the grocery list should go with it, or the list keeps shopping for a meal
     * nobody is cooking. They cannot yet: `groceryListItems` has no meal column, so every line in
     * the database reads as one the shopper wrote themselves, and there is nothing here that could
     * tell a plate's claim from a deliberate instruction. Striking lines off by ingredient would
     * take the shopper's own asking with them, which is the worse failure of the two.
     *
     * `dropMealLines` is still in `_model/` and still tested, waiting for that column — it is the
     * reason a line was given a `meal` field before there was a table to put one in.
     */
    remove: useCallback(() => {
      if (!meal) return;

      store.remove(meal.id);
    }, [meal, store]),
  };
};
