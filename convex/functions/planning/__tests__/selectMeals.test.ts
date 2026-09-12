import { describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";

import { selectMeals, type Candidate, type Need, type Plate, type Stock } from "../selectMeals";

const id = <T extends "ingredients" | "recipes">(name: string) => name as Id<T>;

const TOMATO = id<"ingredients">("tomato");
const RICE = id<"ingredients">("rice");
const THYME = id<"ingredients">("thyme");

const measured = (ingredientId: Id<"ingredients">, amount: number): Need => ({
  ingredientId,
  quantity: amount,
  unit: "g",
  amount,
  kind: "measured",
});

const pinch = (ingredientId: Id<"ingredients">): Need => ({
  ingredientId,
  quantity: 1,
  unit: "cc",
  kind: "pinch",
});

const recipe = (name: string, needs: Need[], isMine = false): Candidate => ({
  recipeId: id<"recipes">(name),
  needs,
  isMine,
});

const plates = (count: number): Plate[] =>
  Array.from({ length: count }, (_, day) => ({ date: day, slot: "lunch", servings: 2 }));

const stock = (entries: [Id<"ingredients">, number][] = []): Stock => new Map(entries);

const pick = (candidates: Candidate[], available: Stock, count: number, ownShare = 1) =>
  selectMeals(candidates, available, plates(count), { ownShare });

const names = (meals: ReturnType<typeof selectMeals>) => meals.map((meal) => meal.candidate.recipeId);

describe("functions/planning/selectMeals", () => {
  test("prefers the recipe the cellar covers", () => {
    const meals = pick(
      [recipe("pasta", [measured(RICE, 100)]), recipe("salad", [measured(TOMATO, 200)])],
      stock([[TOMATO, 500]]),
      1,
    );

    expect(names(meals)).toEqual(["salad"]);
    expect(meals[0]?.covered).toHaveLength(1);
    expect(meals[0]?.missing).toHaveLength(0);
  });

  /** The feature: the second plate is scored against what the first one left. */
  test("consumes stock between plates", () => {
    const meals = pick(
      [
        recipe("salad", [measured(TOMATO, 300)]),
        recipe("sauce", [measured(TOMATO, 300)]),
        recipe("risotto", [measured(RICE, 100)]),
      ],
      stock([
        [TOMATO, 400],
        [RICE, 100],
      ]),
      2,
    );

    expect(names(meals)).toEqual(["salad", "risotto"]);
  });

  test("breaks a tie on the lines partially covered, then on pool order", () => {
    const meals = pick(
      [
        recipe("first", [measured(RICE, 100)]),
        recipe("second", [measured(TOMATO, 300)]),
        recipe("third", [measured(TOMATO, 300)]),
      ],
      stock([[TOMATO, 100]]),
      2,
    );

    expect(names(meals)).toEqual(["second", "first"]);
  });

  /** A partial line is bought, but the part the cellar held is cooked, and gone for the next plate. */
  test("takes the covered part of a partially covered line from stock", () => {
    // Both score one line covered and one partial; pool order puts the sauce first.
    const meals = pick(
      [
        recipe("sauce", [measured(TOMATO, 300), measured(RICE, 50)]),
        recipe("salad", [measured(TOMATO, 100), measured(RICE, 1000)]),
      ],
      stock([
        [TOMATO, 200],
        [RICE, 100],
      ]),
      2,
    );

    expect(names(meals)).toEqual(["sauce", "salad"]);
    expect(meals[0]?.missing).toEqual([measured(TOMATO, 300)]);
    // The sauce's 200 g of tomato went into the sauce, so the salad's 100 g must be bought.
    expect(meals[1]?.missing).toContainEqual(measured(TOMATO, 100));
  });

  test("does not repeat a recipe until the pool is exhausted", () => {
    const covered = recipe("covered", [measured(TOMATO, 1)]);
    const meals = pick(
      [covered, recipe("plain", [measured(RICE, 100)]), recipe("other", [measured(RICE, 100)])],
      stock([[TOMATO, 1000]]),
      5,
    );

    expect(names(meals).slice(0, 3).sort()).toEqual(["covered", "other", "plain"]);
    expect(meals).toHaveLength(5);
  });

  describe("the own share", () => {
    const mine = (name: string) => recipe(name, [measured(TOMATO, 1)], true);
    const catalog = (name: string) => recipe(name, [measured(RICE, 100)]);

    /** Ten plates at 30%: three of the caller's own, however much better they score. */
    test("caps the caller's own recipes at the share, as a ceiling", () => {
      const meals = pick(
        [...["a", "b", "c", "d", "e"].map(mine), ...["v", "w", "x", "y", "z", "u", "t"].map(catalog)],
        stock([[TOMATO, 1000]]),
        10,
        0.3,
      );

      expect(meals.filter((meal) => meal.candidate.isMine)).toHaveLength(3);
    });

    test("lifts the cap when the catalog runs short, before repeating", () => {
      const meals = pick(
        [...["a", "b", "c", "d"].map(mine), catalog("z")],
        stock([[TOMATO, 1000]]),
        5,
        0.3,
      );

      expect(new Set(names(meals)).size).toBe(5);
    });
  });

  describe("staples", () => {
    test("covers a pinch the cellar holds, whatever amount it holds, and takes nothing", () => {
      const meals = pick(
        [recipe("stew", [pinch(THYME)]), recipe("soup", [pinch(THYME), measured(THYME, 1)])],
        stock([[THYME, 0]]),
        2,
      );

      expect(meals[0]?.covered).toEqual([pinch(THYME)]);
      // The pinch took nothing: the same 0 still covers the second plate's pinch.
      expect(meals[1]?.covered).toEqual([pinch(THYME)]);
      expect(meals[1]?.missing).toEqual([measured(THYME, 1)]);
    });

    /** Staples in the cellar must not rank a recipe above one whose real ingredients are there. */
    test("leaves pinches out of the ranking", () => {
      const meals = pick(
        [
          recipe("seasoned", [pinch(THYME), pinch(THYME), pinch(THYME), measured(RICE, 100)]),
          recipe("salad", [measured(TOMATO, 100), measured(RICE, 100)]),
        ],
        stock([
          [THYME, 0],
          [TOMATO, 100],
        ]),
        1,
      );

      // With pinches counted, "seasoned" is 3/4 against 1/2. Without them it is 0/1 against 1/2.
      expect(names(meals)).toEqual(["salad"]);
    });

    test("misses a pinch the cellar does not hold", () => {
      const [meal] = pick([recipe("stew", [pinch(THYME)])], stock(), 1);

      expect(meal?.missing).toEqual([pinch(THYME)]);
    });
  });

  test("never covers a line that could not be measured", () => {
    const unmeasured: Need = { ingredientId: TOMATO, quantity: 2, unit: "pcs", kind: "unmeasured" };
    const [meal] = pick([recipe("salad", [unmeasured])], stock([[TOMATO, 10_000]]), 1);

    expect(meal?.missing).toEqual([unmeasured]);
  });

  test("does not consume the stock it was handed", () => {
    const available = stock([[TOMATO, 300]]);
    pick([recipe("salad", [measured(TOMATO, 300)])], available, 1);

    expect(available.get(TOMATO)).toBe(300);
  });

  test("yields no plate rather than throwing on an empty pool", () => {
    expect(pick([], stock(), 7)).toEqual([]);
  });
});
