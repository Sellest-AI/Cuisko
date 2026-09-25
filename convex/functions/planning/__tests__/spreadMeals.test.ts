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

describe("functions/planning/spreadMeals expiry", () => {
  const DAY = 86_400_000;
  /** The first plate's day. Dates below are counted from it, as `soonestExpiries` hands them over. */
  const MONDAY = 20_000 * DAY;

  const SPINACH = id<"ingredients">("spinach");
  const MILK = id<"ingredients">("milk");

  /** A week drawn one plate a day from Monday, each meal covering the lines `uses` names for it. */
  const week = (candidates: Candidate[], uses: Record<string, Need[]> = {}): SelectedMeal[] =>
    drawn(candidates).map((meal, day) => ({
      ...meal,
      plate: { ...meal.plate, date: MONDAY + day * DAY },
      covered: uses[meal.candidate.recipeId] ?? [],
    }));

  const expiring = (entries: [Id<"ingredients">, number][]) =>
    new Map(entries.map(([ingredientId, days]) => [ingredientId, MONDAY + days * DAY]));

  const gratins = [
    recipe("dauphinois", [measured(CREAM)]),
    recipe("spinach-gratin", [measured(CREAM), measured(SPINACH)]),
    recipe("risotto", [measured(RICE)]),
  ];

  /** The reported case: the meal drawn to use up the spinach was moved past the day it goes off. */
  test("never moves a meal past the day the stock it uses up goes off", () => {
    const meals = spreadMeals(week(gratins, { "spinach-gratin": [measured(SPINACH)] }), new Map(), expiring([[SPINACH, 1]]));

    expect(names(meals)).toEqual(["dauphinois", "spinach-gratin", "risotto"]);
  });

  test("still moves it apart when its stock lasts until the later plate", () => {
    const meals = spreadMeals(week(gratins, { "spinach-gratin": [measured(SPINACH)] }), new Map(), expiring([[SPINACH, 2]]));

    expect(names(meals)).toEqual(["dauphinois", "risotto", "spinach-gratin"]);
  });

  test("ignores the date of stock the meal does not cover", () => {
    const meals = spreadMeals(week(gratins), new Map(), expiring([[SPINACH, 1]]));

    expect(names(meals)).toEqual(["dauphinois", "risotto", "spinach-gratin"]);
  });

  /** Moving the risotto up is least alike, and would leave both gratins one plate for two deadlines. */
  test("keeps alike meals side by side rather than let one of them expire", () => {
    const meals = spreadMeals(
      week(
        [
          recipe("dauphinois", [measured(CREAM)]),
          recipe("spinach-gratin", [measured(CREAM), measured(SPINACH)]),
          recipe("milk-gratin", [measured(CREAM), measured(MILK)]),
          recipe("risotto", [measured(RICE)]),
        ],
        { "spinach-gratin": [measured(SPINACH)], "milk-gratin": [measured(MILK)] },
      ),
      new Map(),
      expiring([[SPINACH, 2], [MILK, 2]]),
    );

    expect(names(meals)).toEqual(["dauphinois", "spinach-gratin", "milk-gratin", "risotto"]);
  });

  /** Nothing can save stock already gone off by the plate it was drawn for; the spread must not add days to it. */
  test("never serves a meal later than drawn when its stock was already late", () => {
    const meals = spreadMeals(week(gratins, { "spinach-gratin": [measured(SPINACH)] }), new Map(), expiring([[SPINACH, -1]]));

    expect(names(meals)).toEqual(["dauphinois", "spinach-gratin", "risotto"]);
  });

  /** Three meals on stock going off the first day: two are late whatever happens, and no later than drawn. */
  test("keeps meals sharing one expiring stock no later than the plates they were drawn for", () => {
    const spinach = { "a": [measured(SPINACH)], "b": [measured(SPINACH)], "c": [measured(SPINACH)] };
    const meals = spreadMeals(
      week(
        [
          recipe("a", [measured(CREAM), measured(SPINACH)]),
          recipe("b", [measured(CREAM), measured(SPINACH)]),
          recipe("c", [measured(CREAM), measured(SPINACH)]),
          recipe("risotto", [measured(RICE)]),
        ],
        spinach,
      ),
      new Map(),
      expiring([[SPINACH, 0]]),
    );

    expect(names(meals)).toEqual(["a", "b", "c", "risotto"]);
  });

  /**
   * The `@limitation` on `spreadMeals`: the deadline stays on the gratin, which drew the spinach,
   * while the risotto moved ahead of it now eats it. This pins what must hold, the stock eaten by
   * its date, not where the deadline sits, which a future version is free to move to the risotto.
   */
  test("serves expiring stock in time when a meal moved ahead takes it from the one that drew it", () => {
    const meals = spreadMeals(
      week(
        [
          recipe("dauphinois", [measured(CREAM)]),
          recipe("spinach-gratin", [measured(CREAM), measured(SPINACH, 200)]),
          recipe("spinach-risotto", [measured(RICE), measured(SPINACH, 200)]),
        ],
        { "spinach-gratin": [measured(SPINACH, 200)] },
      ),
      new Map([[SPINACH, 200]]),
      expiring([[SPINACH, 2]]),
    );

    expect(names(meals)).toEqual(["dauphinois", "spinach-risotto", "spinach-gratin"]);

    const eatsTheSpinach = meals.find((meal) => meal.covered.some((need) => need.ingredientId === SPINACH));
    expect(eatsTheSpinach?.candidate.recipeId).toBe("spinach-risotto");
    expect(eatsTheSpinach!.plate.date).toBeLessThanOrEqual(MONDAY + 2 * DAY);
  });
});
