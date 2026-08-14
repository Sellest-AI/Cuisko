import { useAtom, useAtomValue, type PrimitiveAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";

import { useStockActions } from "~/modules/groceries/hooks";

import {
  addMeal,
  matchesQuery,
  plateIdFor,
  removeMeal,
  replaceMeal,
  setMealServings,
  type MealSlot,
  type PlannedMeal,
  type Recipe,
} from "../_model/model";

import { draftMealsAtom, peopleAtom, planMealsAtom } from "./atoms";
import { RECIPE_CATALOGUE } from "./placeholders";

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

const MEALS_ATOM: Record<MealScope, PrimitiveAtom<PlannedMeal[]>> = {
  plan: planMealsAtom,
  draft: draftMealsAtom,
};

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
  const [meals, setMeals] = useAtom(MEALS_ATOM[scope]);
  const people = useAtomValue(peopleAtom);
  const [query, setQuery] = useState("");
  const { dropMeal } = useStockActions();

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
      if (meal) return setMeals((current) => replaceMeal(current, meal.id, recipe));

      /** A plate that has gone from the plan cannot be given a dish — the sheet is already leaving. */
      if (target.kind !== "slot") return;

      const plate = {
        id: plateIdFor(target.date, target.slot),
        date: target.date,
        slot: target.slot,
        servings: draftServings,
      };

      setMeals((current) => addMeal(current, plate, recipe));
      setCreatedId(plate.id);
    },
    [meal, target, draftServings, setMeals],
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

        setMeals((current) => setMealServings(current, meal.id, servings));
      },
      [meal, setMeals],
    ),
    /**
     * The plate goes, and its claims on the grocery list go with it — otherwise the list keeps
     * shopping for a meal nobody is cooking. Reached through the groceries module's public door,
     * not its `_model/`, so the two domains stay separable (ADR 0006, lint R8).
     */
    remove: useCallback(() => {
      if (!meal) return;

      setMeals((current) => removeMeal(current, meal.id));
      dropMeal(meal.id);
    }, [meal, setMeals, dropMeal]),
  };
};
