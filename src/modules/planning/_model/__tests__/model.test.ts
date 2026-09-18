import { describe, expect, it } from "vitest";

import {
  addDays,
  addMeal,
  draftMealOf,
  buildRows,
  dayStatusFor,
  groceriesFor,
  groceryHeadingOf,
  indexOfDate,
  inEatingOrder,
  isSameDay,
  keptMealCardOf,
  openDates,
  type KeptMeal,
  ownedLinesOf,
  MAX_SERVINGS,
  MAX_TASTES,
  parseDateParam,
  parseMealSlot,
  planAfter,
  planDates,
  planSections,
  plateIdFor,
  removeMeal,
  replaceMeal,
  setMealServings,
  toDateParam,
  toggleTaste,
  toMealCard,
  type DaySection,
  type DraftIngredient,
  type DraftMeal,
  type MealIngredient,
  type MealSlot,
  type Plate,
  type PlannedMeal,
  type Recipe,
} from "../model";

const TODAY = new Date(2026, 7, 12);
const day = (offset: number) => new Date(2026, 7, 12 + offset);

const TOMATO: MealIngredient = {
  id: "tomato", name: "Tomates", category: "vegetables", emoji: "🍅",
  amount: 300, unit: "g",
};

const BEEF: MealIngredient = {
  id: "beef", name: "Boeuf", category: "meats", emoji: "🥩", amount: 400, unit: "g",
};

const meal = (
  id: string,
  slot: MealSlot,
  offset = 0,
  ingredients: MealIngredient[] = [TOMATO],
): PlannedMeal => ({
  id, title: id, minutes: 30, servings: 4, date: day(offset), recipeId: `recipe-${id}`,
  slot, status: "ready", emoji: "🍕", ingredients,
});

const RISOTTO: Recipe = {
  id: "risotto", title: "Risotto aux cèpes", minutes: 45, servings: 2,
  status: "shopping-needed", emoji: "🍚", ingredients: [BEEF],
};

/** A dish served on a plate, the way a caller of `addMeal` / `replaceMeal` builds one. */
const plated = (plate: Plate, recipe: Recipe): PlannedMeal => ({
  ...recipe,
  ingredients: [...recipe.ingredients],
  id: plate.id,
  recipeId: recipe.id,
  date: plate.date,
  slot: plate.slot,
  servings: plate.servings,
});

const TOMATO_LINE: DraftIngredient = {
  ingredientId: "tomato", name: "Tomates", category: "VEGETABLE", emoji: "🍅",
  amount: 300, unit: "g", covered: false,
};

const BEEF_LINE: DraftIngredient = {
  ingredientId: "beef", name: "Boeuf", category: "MEAT", emoji: "🥩", amount: 400, unit: "g", covered: true,
};

/** The same beef, still to be bought: the ordering cases need a line the cellar does not cover. */
const BEEF_TO_BUY: DraftIngredient = { ...BEEF_LINE, covered: false };

const draft = (id: string, slot: MealSlot, ingredients: DraftIngredient[] = [TOMATO_LINE]): DraftMeal => ({
  id, title: id, servings: 4, date: day(0), recipeId: `recipe-${id}`, slot, ingredients,
});

const section = (offset: number, meals: PlannedMeal[]): DaySection => ({
  date: day(offset),
  status: offset < 0 ? "complete" : "pending",
  meals,
});

describe("addDays / isSameDay", () => {
  it("shifts a date without mutating the one given", () => {
    const start = new Date(2026, 7, 12);

    expect(addDays(start, 3).getDate()).toBe(15);
    expect(start.getDate()).toBe(12);
  });

  it("rolls over a month boundary", () => {
    expect(addDays(new Date(2026, 7, 31), 1).getMonth()).toBe(8);
  });

  it("compares calendar days, not instants", () => {
    expect(isSameDay(new Date(2026, 7, 12, 1), new Date(2026, 7, 12, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 7, 12), new Date(2026, 7, 13))).toBe(false);
  });
});

describe("buildRows", () => {
  it("keeps days in order and nests their meals under the day that owns them", () => {
    const rows = buildRows(
      [section(0, [meal("a", "lunch"), meal("b", "dinner")]), section(1, [meal("c", "lunch", 1)])],
      TODAY,
    );

    expect(rows.filter((row) => row.kind === "meal").map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(rows.every((row, index) => index === 0 || rows[index - 1]!.date <= row.date)).toBe(true);
  });

  it("marks only the first row of each day as the one carrying the date marker", () => {
    const rows = buildRows(
      [section(0, [meal("a", "lunch"), meal("b", "dinner")]), section(1, [meal("c", "lunch", 1)])],
      TODAY,
    );

    expect(rows.filter((row) => row.isDayStart).map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("offers an empty plate for each slot a future day has not filled", () => {
    const rows = buildRows([section(1, [meal("c", "lunch", 1)])], TODAY);

    expect(rows.map((row) => row.kind)).toEqual(["meal", "empty"]);
    expect(rows.find((row) => row.kind === "empty")).toMatchObject({ slot: "dinner" });
  });

  /** The anti-goal in PRODUCT.md: a day nobody cooked is empty, never a day they missed. */
  it("draws no empty plate behind the user, so a past day is never shown as a gap", () => {
    const rows = buildRows([section(-2, [meal("a", "lunch", -2)]), section(0, [])], TODAY);

    expect(rows.filter((row) => row.date < TODAY).map((row) => row.kind)).toEqual(["meal"]);
    expect(rows.filter((row) => row.kind === "empty")).toHaveLength(2);
  });

  it("drops a past day it has nothing to say about rather than emitting a bare marker", () => {
    expect(buildRows([section(-1, [])], TODAY)).toEqual([]);
  });

  it("offers an empty plate only for the slots the plan covers", () => {
    const rows = buildRows([section(1, [])], TODAY, { emptySlots: ["dinner"] });

    expect(rows.map((row) => row.kind)).toEqual(["empty"]);
    expect(rows[0]).toMatchObject({ slot: "dinner", isDayStart: true });
  });

  /** A slot switched off after the week was generated still has plates on it — they stay drawn. */
  it("keeps a planned meal in a slot no empty plate is offered for", () => {
    const rows = buildRows([section(1, [meal("c", "lunch", 1)])], TODAY, { emptySlots: ["dinner"] });

    expect(rows.map((row) => row.kind)).toEqual(["meal", "empty"]);
  });

  describe("without empty plates", () => {
    it("emits only the meals that were planned", () => {
      const rows = buildRows([section(1, [meal("c", "dinner", 1)])], TODAY, { emptySlots: [] });

      expect(rows.map((row) => row.kind)).toEqual(["meal"]);
    });

    /**
     * The regression this option exists for: filtering the empties out afterwards deleted the row
     * carrying `isDayStart`, and the day rendered with no date beside it.
     */
    it("still marks a day whose only meal fills the later slot", () => {
      const rows = buildRows([section(1, [meal("c", "dinner", 1)])], TODAY, { emptySlots: [] });

      expect(rows[0]).toMatchObject({ id: "c", isDayStart: true });
    });

    it("marks exactly one row per day across several days", () => {
      const rows = buildRows(
        [section(1, [meal("a", "dinner", 1)]), section(2, [meal("b", "dinner", 2)])],
        TODAY,
        { emptySlots: [] },
      );

      expect(rows.filter((row) => row.isDayStart).map((row) => row.id)).toEqual(["a", "b"]);
    });
  });
});

describe("planAfter", () => {
  it("counts from today when the household has never kept a plate", () => {
    expect(planAfter(TODAY, null)).toEqual(TODAY);
  });

  it("counts from the latest kept plate when it lies ahead", () => {
    expect(planAfter(TODAY, day(4).getTime())).toEqual(day(4));
  });

  it("falls back to today when the latest plate is today or already lived", () => {
    expect(planAfter(TODAY, TODAY.getTime())).toEqual(TODAY);
    expect(planAfter(TODAY, day(-3).getTime())).toEqual(TODAY);
  });

  /** A timestamp drifted off midnight — another device's zone — still lands on a local day. */
  it("pins a timestamp inside a day to that day's midnight", () => {
    expect(planAfter(TODAY, day(4).getTime() + 3 * 3_600_000)).toEqual(day(4));
  });
});

describe("planDates / planSections", () => {
  it("plans from tomorrow, not from a day already half eaten", () => {
    expect(planDates(TODAY, 3)).toEqual([day(1), day(2), day(3)]);
  });

  it("continues the week already kept: the first day is the one after the latest plate", () => {
    expect(planDates(day(4), 2)).toEqual([day(5), day(6)]);
  });

  it("keeps a day the user has emptied, so there is still something to fill", () => {
    const sections = planSections(planDates(TODAY, 2), [meal("a", "lunch", 1)], TODAY);

    expect(sections.map((current) => current.meals.map((one) => one.id))).toEqual([["a"], []]);
  });

  it("gathers a day's meals under the one day, whatever order they arrive in", () => {
    const sections = planSections(planDates(TODAY, 1), [
      meal("dinner", "dinner", 1),
      meal("lunch", "lunch", 1),
    ], TODAY);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.meals.map((one) => one.id)).toEqual(["dinner", "lunch"]);
  });

  it("dates each day against today rather than storing what it was told", () => {
    const sections = planSections([day(-1), day(0), day(1)], [], TODAY);

    expect(sections.map((current) => current.status)).toEqual(["complete", "pending", "empty"]);
  });

  /** A meal the plan is still counting in the groceries has to stay visible in the list. */
  it("keeps a day carrying a meal from outside the range, in date order", () => {
    const sections = planSections(planDates(TODAY, 1), [meal("late", "lunch", 4)], TODAY);

    expect(sections.map((current) => current.date)).toEqual([day(1), day(4)]);
  });
});

describe("dayStatusFor", () => {
  it("reads the clock, not the plan: a day behind is done however empty it was", () => {
    expect(dayStatusFor(day(-1), TODAY)).toBe("complete");
    expect(dayStatusFor(day(1), TODAY)).toBe("empty");
  });

  /** Compared at midnight, so a plan opened at 8pm does not read today as already behind. */
  it("calls today pending whatever time of day either side carries", () => {
    expect(dayStatusFor(new Date(2026, 7, 12, 23, 59), new Date(2026, 7, 12, 0, 1))).toBe("pending");
    expect(dayStatusFor(new Date(2026, 7, 12, 0, 1), new Date(2026, 7, 12, 23, 59))).toBe("pending");
  });
});

describe("indexOfDate", () => {
  const rows = buildRows(
    [section(-1, [meal("a", "lunch", -1)]), section(0, [meal("b", "lunch")])],
    TODAY,
  );

  it("finds the first row of the day asked for", () => {
    expect(indexOfDate(rows, day(0))).toBe(1);
  });

  it("opens on the first row when no date is asked for", () => {
    expect(indexOfDate(rows, undefined)).toBe(0);
  });

  /**
   * A day with nothing on it has no row, so the nearest row after it is the honest answer —
   * falling back to the top would drop the user at the start of a week they scrolled away from.
   */
  it("opens on the next day forward when the day asked for has no rows", () => {
    const sparse = buildRows(
      [section(-3, [meal("a", "lunch", -3)]), section(0, [meal("b", "lunch")])],
      TODAY,
    );

    expect(indexOfDate(sparse, day(-1))).toBe(1);
  });

  /**
   * There is no row after the end, so the nearest one is the last. Falling back to the top is the
   * same failure the sparse-day case rejects, at its worst — the user asked for the far end.
   */
  it("opens on the last row for a date past the end of the plan", () => {
    expect(rows.length).toBeGreaterThan(1);
    expect(indexOfDate(rows, day(40))).toBe(rows.length - 1);
  });

  it("opens on the first row when the plan has no rows at all", () => {
    expect(indexOfDate([], day(0))).toBe(0);
  });

  it("opens on the first row for a date before the plan starts", () => {
    expect(indexOfDate(rows, day(-40))).toBe(0);
  });
});

describe("groceryHeadingOf", () => {
  it("folds catalog categories onto the list's headings", () => {
    expect(groceryHeadingOf("VEGETABLE")).toBe("vegetables");
    expect(groceryHeadingOf("HERB")).toBe("vegetables");
    expect(groceryHeadingOf("EGG")).toBe("meats");
    expect(groceryHeadingOf("SEAFOOD")).toBe("fish");
    expect(groceryHeadingOf("LEGUME")).toBe("grains");
  });

  it("sends what no heading names to other", () => {
    expect(groceryHeadingOf("SPICE")).toBe("other");
  });
});

describe("groceriesFor", () => {
  it("merges the same ingredient across two meals into one row that names both", () => {
    const [vegetables] = groceriesFor([draft("a", "lunch"), draft("b", "dinner")]).missing;

    expect(vegetables?.rows).toHaveLength(1);
    expect(vegetables?.rows[0]).toMatchObject({ amount: 600, mealIds: ["a", "b"] });
  });

  /** Nothing here knows how many grams a piece weighs, so merging the two would invent a number. */
  it("keeps the same ingredient in two units on two separate rows", () => {
    const rows = groceriesFor([
      draft("a", "lunch", [TOMATO_LINE]),
      draft("b", "dinner", [{ ...TOMATO_LINE, amount: 4, unit: "pcs" }]),
    ]).missing[0]?.rows;

    expect(rows).toHaveLength(2);
    expect(rows?.map((row) => row.unit)).toEqual(["g", "pcs"]);
  });

  it("orders categories by the fixed list rather than by what it happened to see first", () => {
    const { missing } = groceriesFor([draft("a", "lunch", [BEEF_TO_BUY, TOMATO_LINE])]);

    expect(missing.map((category) => category.id)).toEqual(["vegetables", "meats"]);
  });

  it("groups catalog categories under the heading they are shopped under", () => {
    const { missing } = groceriesFor([
      draft("a", "lunch", [{ ...TOMATO_LINE, ingredientId: "basil", category: "HERB" }, TOMATO_LINE]),
    ]);

    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ id: "vegetables" });
    expect(missing[0]?.rows).toHaveLength(2);
  });

  it("keeps the surviving categories in the same order when a meal is toggled off", () => {
    const both = [draft("a", "lunch", [TOMATO_LINE]), draft("b", "dinner", [BEEF_TO_BUY])];

    expect(groceriesFor(both).missing.map((category) => category.id)).toEqual(["vegetables", "meats"]);
    expect(groceriesFor(both.slice(0, 1)).missing.map((category) => category.id)).toEqual(["vegetables"]);
  });

  it("returns nothing for no meals", () => {
    expect(groceriesFor([])).toEqual({ missing: [], covered: [] });
  });

  describe("what the cellar already covers", () => {
    it("sends a covered line to the second list and leaves it off the first", () => {
      const { missing, covered } = groceriesFor([draft("a", "lunch", [BEEF_LINE, TOMATO_LINE])]);

      expect(covered.map((row) => row.name)).toEqual(["Boeuf"]);
      expect(missing.flatMap((category) => category.rows).map((row) => row.name)).toEqual(["Tomates"]);
    });

    /** A category with nothing left to buy heads nothing: an empty "Meats" is a heading over a gap. */
    it("drops a category whose every row is covered", () => {
      const { missing } = groceriesFor([draft("a", "lunch", [BEEF_LINE])]);

      expect(missing).toEqual([]);
    });

    /**
     * The stock runs down as the week is served, so a row two plates share can be covered for the
     * first and short for the second. That row is something to buy, not something the kitchen has.
     */
    it("keeps a row missing when one of the meals sharing it was not covered", () => {
      const { missing, covered } = groceriesFor([
        draft("a", "lunch", [BEEF_LINE]),
        draft("b", "dinner", [BEEF_TO_BUY]),
      ]);

      expect(covered).toEqual([]);
      expect(missing.flatMap((category) => category.rows)).toMatchObject([{ covered: false }]);
    });

    /**
     * The page must not charge the shopper for what is already in the cupboard: the covered half of
     * the row is not bought, and `commit` puts only the other half on the list.
     */
    it("asks a part-covered row for its uncovered lines only", () => {
      const { missing } = groceriesFor([
        draft("a", "lunch", [BEEF_LINE]),
        draft("b", "dinner", [BEEF_TO_BUY]),
      ]);

      expect(missing.flatMap((category) => category.rows)).toMatchObject([{ amount: 400 }]);
    });

    it("asks a row nothing covers for the whole of it", () => {
      const { missing } = groceriesFor([draft("a", "lunch", [BEEF_TO_BUY]), draft("b", "dinner", [BEEF_TO_BUY])]);

      expect(missing.flatMap((category) => category.rows)).toMatchObject([{ amount: 800 }]);
    });

    it("still names every meal that asked for a part-covered row", () => {
      const { missing } = groceriesFor([
        draft("a", "lunch", [BEEF_LINE]),
        draft("b", "dinner", [BEEF_TO_BUY]),
      ]);

      expect(missing[0]?.rows[0]?.mealIds).toEqual(["a", "b"]);
    });

    it("orders the covered list by category too", () => {
      const { covered } = groceriesFor([
        draft("a", "lunch", [BEEF_LINE, { ...TOMATO_LINE, covered: true }]),
      ]);

      expect(covered.map((row) => row.name)).toEqual(["Tomates", "Boeuf"]);
    });
  });
});

describe("ownedLinesOf", () => {
  it("answers the ingredient and unit behind each row the shopper ticked", () => {
    const meals = [draft("a", "lunch", [TOMATO_LINE, BEEF_TO_BUY])];

    expect(ownedLinesOf(meals, ["tomato:g"])).toEqual([{ ingredientId: "tomato", unit: "g" }]);
  });

  it("answers each pair once, however many meals asked for it", () => {
    const meals = [draft("a", "lunch"), draft("b", "dinner")];

    expect(ownedLinesOf(meals, ["tomato:g"])).toHaveLength(1);
  });

  /** A row id nothing on the plan matches is a tick from a previous run, and asserts nothing. */
  it("ignores a row id no line carries", () => {
    expect(ownedLinesOf([draft("a", "lunch")], ["carrot:pcs"])).toEqual([]);
  });
});

describe("removeMeal", () => {
  it("drops the plate asked for and leaves every other one where it was", () => {
    const week = [meal("a", "lunch"), meal("b", "dinner"), meal("c", "lunch", 1)];

    expect(removeMeal(week, "b").map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("changes nothing when the plate is not in the plan", () => {
    const week = [meal("a", "lunch")];

    expect(removeMeal(week, "gone")).toEqual(week);
  });
});

describe("addMeal", () => {
  const plate = { id: "2026-08-13:dinner", date: day(1), slot: "dinner" as MealSlot, servings: 3 };

  it("puts the dish on the slot asked for, leaving the rest of the week alone", () => {
    const week = addMeal([meal("a", "lunch")], plated(plate, RISOTTO));

    expect(week.map((entry) => entry.id)).toEqual(["a", "2026-08-13:dinner"]);
    expect(week[1]).toMatchObject({
      title: "Risotto aux cèpes",
      recipeId: "risotto",
      slot: "dinner",
      servings: 3,
    });
    expect(week[1] && isSameDay(week[1].date, day(1))).toBe(true);
  });

  /** The same guard `setMealServings` applies: a route param could ask for a plate for nobody. */
  it("clamps the portions it is created for", () => {
    expect(addMeal([], plated({ ...plate, servings: 0 }, RISOTTO))[0]?.servings).toBe(1);
    expect(addMeal([], plated({ ...plate, servings: 99 }, RISOTTO))[0]?.servings).toBe(MAX_SERVINGS);
  });

  it("copies the recipe's ingredients rather than sharing the array with it", () => {
    const [added] = addMeal([], plated(plate, RISOTTO));

    added?.ingredients.push(TOMATO);

    expect(RISOTTO.ingredients).toHaveLength(1);
  });

  /** The plate a removal left behind is the plate the sheet fills, so the two ids have to agree. */
  it("is findable by the id its own slot implies", () => {
    const week = addMeal([], plated({ ...plate, id: plateIdFor(day(1), "dinner") }, RISOTTO));

    expect(removeMeal(week, plateIdFor(day(1), "dinner"))).toEqual([]);
  });
});

describe("setMealServings", () => {
  it("changes that plate alone", () => {
    const week = setMealServings([meal("a", "lunch"), meal("b", "dinner")], "a", 6);

    expect(week.map((entry) => entry.servings)).toEqual([6, 4]);
  });

  /** The slider cannot ask for these, but a route param or a text field reaching here could. */
  it("clamps to a plate somebody could actually eat", () => {
    const week = [meal("a", "lunch")];

    expect(setMealServings(week, "a", 0)[0]?.servings).toBe(1);
    expect(setMealServings(week, "a", 99)[0]?.servings).toBe(MAX_SERVINGS);
    expect(setMealServings(week, "a", 2.6)[0]?.servings).toBe(3);
  });
});

describe("replaceMeal", () => {
  it("takes the dish from the recipe", () => {
    const [swapped] = replaceMeal([meal("a", "lunch")], "a", (plate) => plated(plate, RISOTTO));

    expect(swapped).toMatchObject({
      title: "Risotto aux cèpes",
      minutes: 45,
      recipeId: "risotto",
      status: "shopping-needed",
    });
  });

  /** The plate is what the week is built on: move it and every other meal shifts around it. */
  it("keeps the plate's own id, day, slot and portions", () => {
    const plate = meal("a", "dinner", 3);
    const [swapped] = replaceMeal([plate], "a", (target) => plated(target, RISOTTO));

    expect(swapped).toMatchObject({ id: "a", slot: "dinner", servings: 4 });
    expect(swapped && isSameDay(swapped.date, day(3))).toBe(true);
  });

  it("copies the recipe's ingredients rather than sharing the array with it", () => {
    const [swapped] = replaceMeal([meal("a", "lunch")], "a", (plate) => plated(plate, RISOTTO));

    swapped?.ingredients.push(TOMATO);

    expect(RISOTTO.ingredients).toHaveLength(1);
  });

  /** The builder hands back a plate, and a builder is caller code: its portions are clamped all the same. */
  it("clamps the portions the builder returns", () => {
    const [swapped] = replaceMeal([meal("a", "lunch")], "a", (plate) => ({
      ...plated(plate, RISOTTO),
      servings: 99,
    }));

    expect(swapped?.servings).toBe(MAX_SERVINGS);
  });
});

describe("toMealCard", () => {
  it("is ready when the cellar covers every line", () => {
    expect(toMealCard(draft("a", "lunch", [BEEF_LINE])).status).toBe("ready");
  });

  it("needs shopping when one line is not covered", () => {
    expect(toMealCard(draft("a", "lunch", [BEEF_LINE, TOMATO_LINE])).status).toBe("shopping-needed");
  });

  it("draws the generated image when there is one, and leaves the fallback to the row otherwise", () => {
    expect(toMealCard({ ...draft("a", "lunch"), imageUrl: "https://x/plate.png" }).imageSrc).toEqual({
      uri: "https://x/plate.png",
    });
    expect(toMealCard(draft("a", "lunch")).imageSrc).toBeUndefined();
  });
});

describe("draftMealOf", () => {
  const answer = {
    recipeId: "recipe-a", date: day(1).getTime(), slot: "dinner" as MealSlot, servings: 3,
    title: "Soupe", minutes: 20, ingredients: [TOMATO_LINE],
  };

  it("names the plate by its day and slot, and makes the day a Date", () => {
    const meal = draftMealOf(answer);

    expect(meal.id).toBe(plateIdFor(day(1), "dinner"));
    expect(isSameDay(meal.date, day(1))).toBe(true);
    expect(meal).toMatchObject({ recipeId: "recipe-a", slot: "dinner", servings: 3, title: "Soupe" });
  });

  /** The id a swap lands under is the id the review step already holds for that plate, whatever the dish. */
  it("names two dishes on the same day and slot the same", () => {
    expect(draftMealOf({ ...answer, recipeId: "recipe-b" }).id).toBe(draftMealOf(answer).id);
  });
});

describe("parseDateParam", () => {
  it("reads a well-formed day at local midnight", () => {
    const parsed = parseDateParam("2026-08-12");

    expect(parsed && isSameDay(parsed, TODAY)).toBe(true);
    expect(parsed?.getHours()).toBe(0);
  });

  it("ignores a missing param, a repeated one, and anything not shaped like a date", () => {
    expect(parseDateParam(undefined)).toBeUndefined();
    expect(parseDateParam(["2026-08-12"])).toBeUndefined();
    expect(parseDateParam("tomorrow")).toBeUndefined();
    expect(parseDateParam("12/08/2026")).toBeUndefined();
  });

  /** Shaped like a date but not one — the case a bare `new Date()` turns into `Invalid Date`. */
  it("ignores an impossible day", () => {
    expect(parseDateParam("2026-02-31")).toBeUndefined();
  });
});

describe("toDateParam", () => {
  /**
   * The regression behind a focus day that never survived the trip: the carousel was handing the
   * list a `Date.toDateString()`, which `parseDateParam` rejects, so the week silently opened on
   * its first plate. Only the round trip catches a producer and a parser drifting apart — each is
   * self-consistent on its own.
   */
  it("writes the format its parser reads back", () => {
    const day = new Date(2026, 7, 12);
    const parsed = parseDateParam(toDateParam(day));

    expect(parsed && isSameDay(parsed, day)).toBe(true);
  });

  it("pads a single-digit month and day, which is what the parser requires", () => {
    expect(toDateParam(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("parseMealSlot", () => {
  it("reads the slots a day actually has", () => {
    expect(parseMealSlot("lunch")).toBe("lunch");
    expect(parseMealSlot("dinner")).toBe("dinner");
  });

  /** A slot nothing draws would create a plate invisible in every list built from `MEAL_SLOTS`. */
  it("ignores a missing param, a repeated one, and a meal nobody plans", () => {
    expect(parseMealSlot(undefined)).toBeUndefined();
    expect(parseMealSlot(["lunch"])).toBeUndefined();
    expect(parseMealSlot("brunch")).toBeUndefined();
  });
});

describe("plateIdFor", () => {
  it("names the slot it fills, so the same empty plate cannot become two", () => {
    expect(plateIdFor(day(1), "dinner")).toBe(plateIdFor(day(1), "dinner"));
    expect(plateIdFor(day(1), "dinner")).not.toBe(plateIdFor(day(1), "lunch"));
    expect(plateIdFor(day(1), "dinner")).not.toBe(plateIdFor(day(2), "dinner"));
  });
});

describe("toggleTaste", () => {
  it("adds a taste that is not picked yet, and keeps the order they were picked in", () => {
    expect(toggleTaste([], "comfort")).toEqual(["comfort"]);
    expect(toggleTaste(["comfort"], "spicy")).toEqual(["comfort", "spicy"]);
  });

  it("turns off a taste that is already picked", () => {
    expect(toggleTaste(["comfort", "spicy"], "comfort")).toEqual(["spicy"]);
  });

  /** The rows past the ceiling are drawn disabled, so accepting this would contradict the grid. */
  it("refuses a taste past the ceiling rather than evicting the oldest", () => {
    const full = ["a", "b", "c", "d"];

    expect(toggleTaste(full, "e")).toEqual(full);
    expect(full).toHaveLength(MAX_TASTES);
  });

  /** Turning one off is how the user makes room — a full list that cannot shrink is a dead end. */
  it("still turns a taste off when the list is full", () => {
    expect(toggleTaste(["a", "b", "c", "d"], "b")).toEqual(["a", "c", "d"]);
  });

  /** Allergies pass their own ceiling: an exclusion list has to be able to be complete. */
  it("honours a ceiling raised by the caller", () => {
    expect(toggleTaste(["a", "b", "c", "d"], "e", 9)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("keptMealCardOf", () => {
  const kept: KeptMeal = {
    id: "plate", date: day(1).getTime(), slot: "dinner", servings: 3, status: "shopping-needed",
    recipe: { id: "soup", title: "Soupe", minutes: 20, plateImageUrl: "https://img/soup.png" },
  };

  it("names the plate by its own id and the dish by the recipe's", () => {
    expect(keptMealCardOf(kept)).toMatchObject({ id: "plate", recipeId: "soup", title: "Soupe", servings: 3 });
  });

  it("turns the day back into a Date and the plate image into an image source", () => {
    const card = keptMealCardOf(kept);

    expect(isSameDay(card.date, day(1))).toBe(true);
    expect(card.imageSrc).toEqual({ uri: "https://img/soup.png" });
  });

  /** Absent, so the row falls back to its placeholder rather than drawing a broken image. */
  it("leaves the image out when the recipe has no plate image", () => {
    expect(keptMealCardOf({ ...kept, recipe: { id: "soup", title: "Soupe" } }).imageSrc).toBeUndefined();
  });
});

describe("inEatingOrder", () => {
  it("orders by day, then lunch before dinner within one", () => {
    const ordered = inEatingOrder([meal("d1", "dinner", 1), meal("l1", "lunch", 1), meal("d0", "dinner", 0)]);

    expect(ordered.map((entry) => entry.id)).toEqual(["d0", "l1", "d1"]);
  });

  it("does not reorder the array it was given", () => {
    const meals = [meal("d0", "dinner"), meal("l0", "lunch")];
    inEatingOrder(meals);

    expect(meals.map((entry) => entry.id)).toEqual(["d0", "l0"]);
  });
});

describe("openDates", () => {
  it("runs from today through the last planned day", () => {
    expect(openDates(TODAY, [meal("a", "lunch", 2), meal("b", "lunch", -3)])).toEqual([day(0), day(1), day(2)]);
  });

  /** Today still gets its empty plates, which is the invitation to plan at all. */
  it("offers today alone when nothing lies ahead", () => {
    expect(openDates(TODAY, [meal("past", "lunch", -1)])).toEqual([day(0)]);
  });

  it("starts at midnight whatever time today was read at", () => {
    expect(openDates(new Date(2026, 7, 12, 18, 30), [])).toEqual([day(0)]);
  });
});
