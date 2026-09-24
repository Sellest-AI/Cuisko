import { describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Cuisine } from "@shared/cuisines";

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
  unit: "tsp",
  kind: "pinch",
});

/** `"other"` by default: it is never counted as a repeat, so only the tests about cuisine see one. */
const recipe = (name: string, needs: Need[], isMine = false, cuisine: Cuisine = "other"): Candidate => ({
  recipeId: id<"recipes">(name),
  needs,
  cuisine,
  isMine,
});

/**
 * Recipes sharing nothing with anything, to give a pool the breadth rarity is measured against.
 * In a three-recipe pool an ingredient two of them use is "common", which no real pool would say.
 */
const fillers = (count: number) =>
  Array.from({ length: count }, (_, index) => recipe(`filler-${index}`, [measured(id<"ingredients">(`only-${index}`), 1)]));

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
      1,
    );

    // "second" beats "first" on the partial line, and "third" on pool order.
    expect(names(meals)).toEqual(["second"]);
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

  describe("the basket", () => {
    const FETA = id<"ingredients">("feta");
    const OLIVES = id<"ingredients">("olives");
    const LENTILS = id<"ingredients">("lentils");

    /** The chain: a random first plate, then the plate that cooks with what the first one buys. */
    test("prefers the recipe that shares what an earlier plate buys", () => {
      const meals = pick(
        [
          recipe("salad", [measured(TOMATO, 300), measured(FETA, 100)]),
          recipe("dal", [measured(LENTILS, 200), measured(RICE, 100)]),
          recipe("pie", [measured(FETA, 200), measured(OLIVES, 50)]),
        ],
        stock(),
        2,
      );

      expect(names(meals)).toEqual(["salad", "pie"]);
      // Still bought: the basket knows feta is coming, not how much of the block will be spare.
      expect(meals[1]?.missing).toContainEqual(measured(FETA, 200));
    });

    test("ranks a line the cellar holds above a line the basket holds", () => {
      const meals = pick(
        [
          recipe("salad", [measured(TOMATO, 300), measured(LENTILS, 100)]),
          recipe("sauce", [measured(TOMATO, 300), measured(FETA, 100)]),
          recipe("risotto", [measured(RICE, 100), measured(OLIVES, 50)]),
        ],
        stock([
          [LENTILS, 100],
          [RICE, 100],
        ]),
        2,
      );

      // Plate 1: salad and risotto both half in the cellar, pool order picks the salad.
      // Plate 2: the sauce is half in the basket, the risotto half in the cupboard. Owned beats bought.
      expect(names(meals)).toEqual(["salad", "risotto"]);
    });

    /** Fewer new rows on the list beats more shared rows: shares of the recipe's own lines. */
    test("prefers one purchase reused out of two over two reused out of seven", () => {
      const seven = [TOMATO, FETA, OLIVES, LENTILS, RICE, id<"ingredients">("lamb"), id<"ingredients">("mint")];
      const meals = pick(
        [
          recipe("salad", [measured(TOMATO, 300), measured(FETA, 100)]),
          recipe("feast", seven.map((ingredient) => measured(ingredient, 100))),
          recipe("toast", [measured(FETA, 50), measured(id<"ingredients">("bread"), 2)]),
          ...fillers(3),
        ],
        stock(),
        2,
      );

      expect(names(meals)).toEqual(["salad", "toast"]);
    });

    test("leaves pinches out of the basket", () => {
      const meals = pick(
        [
          recipe("stew", [measured(LENTILS, 200), pinch(THYME)]),
          recipe("roast", [measured(RICE, 100), pinch(THYME)]),
          recipe("dal", [measured(LENTILS, 100), measured(OLIVES, 50)]),
        ],
        stock(),
        2,
      );

      // The roast shares the stew's thyme, the dal shares its lentils; only the lentils count.
      expect(names(meals)).toEqual(["stew", "dal"]);
    });

    /** Ten plates at 40%: a purchase pulls four reuses, then the pool's own order resumes. */
    test("stops crediting a purchase at the horizon, 40% of the week's plates", () => {
      const withTomato = (name: string) => recipe(name, [measured(TOMATO, 100), measured(id<"ingredients">(name), 1)]);
      const meals = pick(
        [withTomato("a"), recipe("dal", [measured(LENTILS, 1)]), ...["b", "c", "d", "e", "f", "g", "h", "i", "j"].map(withTomato)],
        stock(),
        10,
      );

      // a buys; b, c, d, e reuse; the horizon is spent, so the dal takes its pool place ahead of f.
      expect(names(meals)).toEqual(["a", "b", "c", "d", "e", "dal", "f", "g", "h", "i"]);
    });

    test("keeps a horizon of two reuses on the shortest week", () => {
      const withTomato = (name: string) => recipe(name, [measured(TOMATO, 100), measured(id<"ingredients">(name), 1)]);
      const meals = pick(
        [withTomato("a"), recipe("dal", [measured(LENTILS, 1)]), withTomato("b"), withTomato("c")],
        stock(),
        3,
      );

      // 40% of three plates rounds to one reuse; the floor keeps two, so c still beats the dal.
      expect(names(meals)).toEqual(["a", "b", "c"]);
    });

    /** Without the fade, x2 would take the third plate on pool order: both reuse one purchase. */
    test("credits a purchase less with each plate that has already reused it", () => {
      const X = id<"ingredients">("x");
      const Y = id<"ingredients">("y");
      const using = (name: string, ingredient: Id<"ingredients">) => recipe(name, [measured(ingredient, 1), measured(id<"ingredients">(name), 1)]);
      const meals = pick(
        [recipe("base", [measured(X, 1), measured(Y, 1)]), using("x1", X), using("x2", X), using("y1", Y), using("y2", Y)],
        stock(),
        3,
      );

      expect(names(meals)).toEqual(["base", "x1", "y1"]);
    });

    /** Onion is in most of the pool, so sharing it says little; the capers say the dishes belong together. */
    test("credits a rare purchase above a common one", () => {
      const ONION = id<"ingredients">("onion");
      const CAPERS = id<"ingredients">("capers");
      const using = (name: string, ingredient: Id<"ingredients">) => recipe(name, [measured(ingredient, 1), measured(id<"ingredients">(name), 1)]);
      const meals = pick(
        [
          recipe("base", [measured(ONION, 1), measured(CAPERS, 1)]),
          using("stew", ONION),
          using("puttanesca", CAPERS),
          using("soup", ONION),
          using("curry", ONION),
          using("chili", ONION),
        ],
        stock(),
        2,
      );

      expect(names(meals)).toEqual(["base", "puttanesca"]);
    });

    test("gives no credit for sharing an ingredient every candidate uses", () => {
      const using = (name: string) => recipe(name, [measured(TOMATO, 1), measured(id<"ingredients">(name), 1)]);
      const meals = pick([using("a"), recipe("dal", [measured(TOMATO, 1)]), using("b")], stock(), 2);

      // All three use tomato, so reusing it is worth nothing and the second plate is pool order.
      // Credited, b's and the dal's reuse would tie on half their lines against all of them.
      expect(names(meals)).toEqual(["a", "dal"]);
    });

    test("puts a line that could not be measured in the basket", () => {
      const unmeasured: Need = { ingredientId: TOMATO, quantity: 2, unit: "pcs", kind: "unmeasured" };
      const meals = pick(
        [recipe("salad", [unmeasured]), recipe("dal", [measured(LENTILS, 200)]), recipe("sauce", [measured(TOMATO, 300)])],
        stock(),
        2,
      );

      // Two tomatoes are bought whatever the unit says, so the sauce cooks with them.
      expect(names(meals)).toEqual(["salad", "sauce"]);
    });

    test("puts the bought remainder of a partially covered line in the basket", () => {
      const meals = pick(
        [recipe("salad", [measured(TOMATO, 300)]), recipe("dal", [measured(LENTILS, 200)]), recipe("sauce", [measured(TOMATO, 300)])],
        stock([[TOMATO, 100]]),
        2,
      );

      // The salad takes the 100 g and buys 200 g more; that purchase is what the sauce shares.
      expect(names(meals)).toEqual(["salad", "sauce"]);
    });

    test("spends one reuse per ingredient, however many lines name it", () => {
      const twice = (name: string) => recipe(name, [measured(TOMATO, 100), measured(TOMATO, 50), measured(id<"ingredients">(name), 1)]);
      const meals = pick(
        [twice("a"), twice("b"), recipe("dal", [measured(LENTILS, 1)]), twice("c"), twice("d"), twice("e")],
        stock(),
        6,
      );

      // Six plates keep two reuses. Counted per line, b would spend both alone and c would fall
      // behind the dal; counted per ingredient, b and c each spend one.
      expect(names(meals)).toEqual(["a", "b", "c", "dal", "d", "e"]);
    });

    test("gives a repeat no credit for sharing its own purchases", () => {
      const meals = pick(
        [recipe("salad", [measured(TOMATO, 300)]), recipe("dal", [measured(LENTILS, 200)])],
        stock(),
        3,
      );

      // The third plate is a repeat either way; without the basket it is pool order, the salad.
      expect(names(meals)).toEqual(["salad", "dal", "salad"]);
    });

    test("is deterministic for a given pool order", () => {
      const pool = [
        recipe("salad", [measured(TOMATO, 300), measured(FETA, 100)]),
        recipe("dal", [measured(LENTILS, 200), measured(RICE, 100)]),
        recipe("pie", [measured(FETA, 200), measured(OLIVES, 50)]),
        recipe("bowl", [measured(RICE, 100), measured(OLIVES, 50)]),
      ];

      expect(names(pick(pool, stock(), 4))).toEqual(names(pick(pool, stock(), 4)));
    });
  });

  describe("variety", () => {
    const TORTILLA = id<"ingredients">("tortilla");
    const BEANS = id<"ingredients">("beans");
    const unique = (name: string) => measured(id<"ingredients">(name), 1);

    /** Burrito and curry each reuse one of the tacos' two purchases; the cuisine decides. */
    test("bends a close call away from a cuisine the week already served", () => {
      const meals = pick(
        [
          recipe("tacos", [measured(TORTILLA, 1), measured(BEANS, 1)], false, "mexican"),
          recipe("burrito", [measured(TORTILLA, 1), unique("rice")], false, "mexican"),
          recipe("curry", [measured(BEANS, 1), unique("coconut")], false, "indian"),
          ...fillers(3),
        ],
        stock(),
        2,
      );

      expect(names(meals)).toEqual(["tacos", "curry"]);
    });

    /** The wrap reuses its one line, the curry one of three: a repeat still wins a clear case. */
    test("does not overturn a clearly better reuse", () => {
      const meals = pick(
        [
          recipe("tacos", [measured(TORTILLA, 1), measured(BEANS, 1)], false, "mexican"),
          recipe("curry", [measured(BEANS, 1), unique("coconut"), unique("spinach")], false, "indian"),
          recipe("wrap", [measured(TORTILLA, 1)], false, "mexican"),
          ...fillers(3),
        ],
        stock(),
        2,
      );

      expect(names(meals)).toEqual(["tacos", "wrap"]);
    });

    test("never counts a cuisine naming no tradition as a repeat", () => {
      const meals = pick(
        [
          recipe("tacos", [measured(TORTILLA, 1), measured(BEANS, 1)], false, "fusion"),
          recipe("burrito", [measured(TORTILLA, 1), unique("rice")], false, "fusion"),
          recipe("curry", [measured(BEANS, 1), unique("coconut")], false, "indian"),
          ...fillers(3),
        ],
        stock(),
        2,
      );

      // Scored alike and nothing to penalise: pool order keeps the burrito.
      expect(names(meals)).toEqual(["tacos", "burrito"]);
    });
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

  describe("alternatives", () => {
    const alternatives = (meal: ReturnType<typeof selectMeals>[number] | undefined) =>
      meal?.alternatives.map((candidate) => candidate.recipeId);

    /** Scored like the winner: a full cellar line, then a partial one, then pool order. */
    test("offers four runners-up per plate, best first", () => {
      const [meal] = pick(
        [
          recipe("plain", [measured(RICE, 100)]),
          recipe("other", [measured(RICE, 100)]),
          recipe("partial", [measured(TOMATO, 300)]),
          recipe("covered", [measured(TOMATO, 100)]),
          recipe("half", [measured(TOMATO, 100), measured(RICE, 100)]),
          recipe("last", [measured(RICE, 100)]),
        ],
        stock([[TOMATO, 200]]),
        1,
      );

      expect(meal?.candidate.recipeId).toBe("covered");
      expect(alternatives(meal)).toEqual(["half", "partial", "plain", "other"]);
    });

    /** A runner-up for the first plate that a later plate picked is already on the week. */
    test("offers no recipe the week picked, including a later plate's", () => {
      const meals = pick(
        [
          recipe("salad", [measured(TOMATO, 300)]),
          recipe("sauce", [measured(TOMATO, 100)]),
          recipe("dal", [measured(RICE, 100)]),
          recipe("bowl", [measured(RICE, 100)]),
        ],
        stock([
          [TOMATO, 300],
          [RICE, 100],
        ]),
        2,
      );

      expect(names(meals)).toEqual(["salad", "dal"]);
      expect(alternatives(meals[0])).toEqual(["sauce", "bowl"]);
      expect(alternatives(meals[1])).toEqual(["bowl", "sauce"]);
    });

    test("offers fewer than four on a short pool", () => {
      const [meal] = pick([recipe("salad", [measured(TOMATO, 1)]), recipe("dal", [measured(RICE, 1)])], stock(), 1);

      expect(alternatives(meal)).toEqual(["dal"]);
    });

    test("offers none once repeats begin and every recipe is on the week", () => {
      const meals = pick([recipe("salad", [measured(TOMATO, 1)]), recipe("dal", [measured(RICE, 1)])], stock(), 3);

      expect(meals.map((meal) => meal.alternatives)).toEqual([[], [], []]);
    });

    /** The plate's own eligibility: past the own-share cap, the caller's recipes are not offered either. */
    test("follows the plate's own-share cap", () => {
      const meals = pick(
        [recipe("mine", [measured(TOMATO, 1)], true), recipe("also-mine", [measured(TOMATO, 1)], true), recipe("dal", [measured(RICE, 1)])],
        stock([[TOMATO, 10]]),
        1,
        0,
      );

      expect(names(meals)).toEqual(["dal"]);
      expect(alternatives(meals[0])).toEqual([]);
    });
  });
});
