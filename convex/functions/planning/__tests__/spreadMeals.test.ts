import { describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Cuisine } from "@shared/cuisines";

import { type Candidate, type Need, type SelectedMeal, type Stock } from "../selectMeals";
import { spreadMeals } from "../spreadMeals";

const id = <T extends "ingredients" | "recipes">(name: string) => name as Id<T>;

const CREAM = id<"ingredients">("cream");
const CHEESE = id<"ingredients">("cheese");
const TOMATO = id<"ingredients">("tomato");
const RICE = id<"ingredients">("rice");
const ONION = id<"ingredients">("onion");
const SALT = id<"ingredients">("salt");

const measured = (ingredientId: Id<"ingredients">, amount = 100): Need => ({
  ingredientId,
  quantity: amount,
  unit: "g",
  amount,
  kind: "measured",
});

const pinch = (ingredientId: Id<"ingredients">): Need => ({ ingredientId, quantity: 1, unit: "tsp", kind: "pinch" });

const recipe = (name: string, needs: Need[], cuisine: Cuisine = "other"): Candidate => ({
  recipeId: id<"recipes">(name),
  needs,
  cuisine,
  isMine: false,
});

/** A week as `selectMeals` draws it: plate `n` holds the `n`th recipe, nothing covered yet. */
const drawn = (candidates: Candidate[]): SelectedMeal[] =>
  candidates.map((candidate, day) => ({
    plate: { date: day, slot: "lunch", servings: 2 },
    candidate,
    covered: [],
    missing: candidate.needs,
    alternatives: [],
  }));

const names = (meals: SelectedMeal[]) => meals.map((meal) => meal.candidate.recipeId);

const spread = (candidates: Candidate[], stock: Stock = new Map()) => spreadMeals(drawn(candidates), stock);

describe("functions/planning/spreadMeals", () => {
  /** The reported case: a chain of three gratins, each a different recipe, served back to back. */
  test("moves a chain of alike meals apart", () => {
    const meals = spread([
      recipe("dauphinois", [measured(CREAM), measured(CHEESE)], "french"),
      recipe("tartiflette", [measured(CREAM), measured(CHEESE)], "french"),
      recipe("macaronis", [measured(CREAM), measured(CHEESE)], "french"),
      recipe("risotto", [measured(RICE)], "italian"),
      recipe("salad", [measured(TOMATO)], "greek"),
    ]);

    expect(names(meals)).toEqual(["dauphinois", "risotto", "tartiflette", "salad", "macaronis"]);
  });

  test("keeps the same recipes, the first plate's meal and every plate where it was", () => {
    const candidates = [
      recipe("a", [measured(CREAM)]),
      recipe("b", [measured(CREAM)]),
      recipe("c", [measured(RICE)]),
    ];
    const meals = spread(candidates);

    expect(names(meals)[0]).toBe("a");
    expect([...names(meals)].sort()).toEqual(["a", "b", "c"]);
    expect(meals.map((meal) => meal.plate.date)).toEqual([0, 1, 2]);
  });

  test("separates two plates of one cuisine sharing nothing", () => {
    const meals = spread([
      recipe("tacos", [measured(TOMATO)], "mexican"),
      recipe("burrito", [measured(RICE)], "mexican"),
      recipe("curry", [measured(ONION)], "indian"),
    ]);

    expect(names(meals)).toEqual(["tacos", "curry", "burrito"]);
  });

  test("never counts a cuisine naming no tradition as alike", () => {
    const meals = spread([
      recipe("a", [measured(TOMATO)], "other"),
      recipe("b", [measured(RICE)], "other"),
      recipe("c", [measured(ONION)], "french"),
    ]);

    expect(names(meals)).toEqual(["a", "b", "c"]);
  });

  test("leaves pinches out of what two meals share", () => {
    const meals = spread([
      recipe("a", [measured(TOMATO), pinch(SALT)]),
      recipe("b", [measured(RICE), pinch(SALT)]),
      recipe("c", [measured(ONION)]),
    ]);

    expect(names(meals)).toEqual(["a", "b", "c"]);
  });

  /** `commitPlan` weighs the cellar in the order the week is eaten; the draft must say the same. */
  test("recomputes coverage in the order the meals are served", () => {
    const meals = spreadMeals(
      [
        { ...drawn([recipe("a", [measured(ONION)])])[0]!, plate: { date: 0, slot: "lunch", servings: 2 } },
        {
          plate: { date: 1, slot: "lunch", servings: 2 },
          candidate: recipe("b", [measured(ONION), measured(TOMATO, 300)]),
          covered: [measured(TOMATO, 300)],
          missing: [measured(ONION)],
          alternatives: [],
        },
        {
          plate: { date: 2, slot: "lunch", servings: 2 },
          candidate: recipe("c", [measured(TOMATO, 300)]),
          covered: [],
          missing: [measured(TOMATO, 300)],
          alternatives: [],
        },
      ],
      new Map([[TOMATO, 300]]),
    );

    expect(names(meals)).toEqual(["a", "c", "b"]);
    expect(meals[1]?.covered).toEqual([measured(TOMATO, 300)]);
    expect(meals[2]?.covered).toEqual([]);
    expect(meals[2]?.missing).toEqual([measured(ONION), measured(TOMATO, 300)]);
  });

  test("carries each meal's alternatives with it", () => {
    const [a, b, c] = drawn([recipe("a", [measured(CREAM)]), recipe("b", [measured(CREAM)]), recipe("c", [measured(RICE)])]);
    const runnerUp = recipe("runner-up", [measured(ONION)]);

    const meals = spreadMeals([a!, { ...b!, alternatives: [runnerUp] }, c!], new Map());

    expect(meals.find((meal) => meal.candidate.recipeId === "b")?.alternatives).toEqual([runnerUp]);
  });

  test("does not consume the stock it was handed", () => {
    const available: Stock = new Map([[TOMATO, 300]]);
    spread([recipe("a", [measured(TOMATO, 300)])], available);

    expect(available.get(TOMATO)).toBe(300);
  });

  test("yields no plate from an empty week", () => {
    expect(spreadMeals([], new Map())).toEqual([]);
  });
});
