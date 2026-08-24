/**
 * The planning domain: what a planned week is made of, and the derivations drawn from it.
 *
 * Framework-free — no React, no Jotai, no Convex (see `src/modules/AGENTS.md`). The one component
 * import is a type, erased at build time, so this file still runs and tests without a
 * provider tree.
 */

import type { Unit } from "@shared/ingredients";
import { foldAccents } from "@shared/translations";

import type { ImageProps } from "@ui/image";

/** Whatever `@ui/image` accepts, named here so `_model/` depends on no component. */
export type ImageSource = ImageProps["source"];

export type MealSlot = "lunch" | "dinner";

/**
 * Where a meal has got to. `empty` is not a failure state — a day nobody cooked is empty, and
 * PRODUCT.md's third anti-goal is explicit that the plan never shows a deviation as a miss.
 */
export type MealStatus = "cooked" | "ready" | "shopping-needed" | "empty";

/** How far the day as a whole has got — the shape `DayMarker` already draws. */
export type DayStatus = "complete" | "pending" | "empty";

export type MealIngredient = {
  id: string;
  name: string;
  /** Groups the grocery list. An id, not a label: the screen translates it, this file cannot. */
  category: string;
  emoji: string;
  amount: number;
  unit: Unit;
  /** Shown under the name as `1.3€/kg`. Absent where an ingredient has no meaningful unit price. */
  pricePerKg?: number;
};

/**
 * A dish, before the week has a place for it.
 *
 * Apart from `PlannedMeal` because the two ids mean different things: a recipe's id names the
 * dish, a meal's names the plate it was put on — and one week can serve the same dish twice. The
 * swap sheet offers these; `replaceMeal` puts one onto a plate that already exists.
 */
export type Recipe = {
  id: string;
  title: string;
  minutes: number;
  /** What the dish yields as written. A plate is scaled off it; the recipe itself is not. */
  servings: number;
  status: MealStatus;
  /** Stands in for the cuisine icon beside the cooking time until real ones exist. */
  emoji: string;
  imageSrc?: ImageSource;
  ingredients: MealIngredient[];
};

/** A recipe on a plate: the day it lands on, which meal of that day it is, and for how many. */
export type PlannedMeal = Omit<Recipe, "id"> & {
  /** The plate. Unique across the week, unlike `recipeId`, which repeats when a dish does. */
  id: string;
  recipeId: string;
  /** The day this meal is planned for. Set where the plan is built, never derived from position. */
  date: Date;
  slot: MealSlot;
};

export type DaySection = {
  date: Date;
  status: DayStatus;
  meals: PlannedMeal[];
};

type RowBase = {
  id: string;
  date: Date;
  dayStatus: DayStatus;
  /**
   * The first row of its day carries the date marker; the rest indent past it. The marker sits
   * beside the meal rather than above them, so the day is a column, not a header.
   */
  isDayStart: boolean;
};

/** The list's flat source. One row per plate — planned or not — which is what FlashList renders. */
export type PlanningRow =
  | (RowBase & { kind: "meal"; meal: PlannedMeal })
  | (RowBase & { kind: "empty"; slot: MealSlot });

export type GroceryRow = {
  /** Ingredient and unit together: two units of one ingredient cannot share a line. */
  id: string;
  name: string;
  emoji: string;
  amount: number;
  unit: Unit;
  pricePerKg?: number;
  /** The meals needing it, drawn as the stack of little plates under the name. */
  mealIds: string[];
};

export type GroceryCategory = { id: string; rows: GroceryRow[] };

/**
 * Every plate a day can hold, in the order a day is eaten.
 *
 * Exported because the setup step offers the same list to choose from: a second copy there would
 * be free to drift, and the day a third slot exists the two would disagree about what a day is.
 */
export const MEAL_SLOTS: MealSlot[] = ["lunch", "dinner"];

/** A week. Past that the plan is guessing at a shop that has not happened yet. */
export const MAX_DAYS = 7;

/**
 * The most a single plate is cooked for.
 *
 * Separate from the household size the setup step asks: a plate can be cooked for more than the
 * table when the point is leftovers, which is the whole reason portions are editable per meal.
 */
export const MAX_SERVINGS = 8;

/**
 * Fixed order, so a category never changes place when a meal is toggled off in the review step —
 * a list that reshuffles under the finger is a list nobody trusts. A category absent from here
 * sorts last, alphabetically, rather than disappearing.
 */
export const CATEGORY_ORDER = ["vegetables", "meats", "fish", "dairy", "grains", "other"] as const;

/**
 * The categories this file can emit.
 *
 * Exported so the screen naming them can key its translation table off this union rather than a
 * list of its own: a seventh category added here is then a compile error at the table, instead of
 * silently drawing as "Odds and ends" the way a string-keyed lookup with a fallback would.
 */
export type CategoryId = (typeof CATEGORY_ORDER)[number];

/** Local time on purpose — "Tuesday" has to mean the user's Tuesday, not UTC's. */
export const isSameDay = (first: Date, second: Date) =>
  first.getDate() === second.getDate() &&
  first.getMonth() === second.getMonth() &&
  first.getFullYear() === second.getFullYear();

export const addDays = (date: Date, days: number) => {
  const shifted = new Date(date);
  shifted.setDate(date.getDate() + days);
  return shifted;
};

const _startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * The days a fresh plan covers: tomorrow onwards.
 *
 * Today is not one of them — a plan made at dinner time cannot shop for a lunch already eaten, so
 * the offer starts on the first day it can still be kept. Shared with the generation rather than
 * each side counting its own days, because a plan whose list covers a day its meals do not would
 * hide a meal at one end and offer an unfillable day at the other.
 */
export const planDates = (today: Date, days: number): Date[] =>
  Array.from({ length: days }, (_, index) => addDays(today, index + 1));

/**
 * How far a day has got, from where it sits against today.
 *
 * Derived rather than stored, because it is the calendar's answer and not the plan's: a day behind
 * the user is done with whatever it held, and a day ahead is still open however full it looks. The
 * day per-meal status is a different question, and `MealStatus` answers that one.
 */
export const dayStatusFor = (date: Date, today: Date): DayStatus => {
  const day = _startOfDay(date);
  const now = _startOfDay(today);

  if (day < now) return "complete";

  return isSameDay(day, now) ? "pending" : "empty";
};

/**
 * The plan's days, each carrying whatever landed on it.
 *
 * Built from the dates rather than grouped from the meals, so a day the user has emptied keeps its
 * place and can be filled again — grouping would take the day out of the list with its last plate,
 * and there would be nothing left to tap.
 *
 * A meal dated outside the range keeps a day of its own rather than being dropped: the generation
 * stamped that date, and a plan that silently stops listing a meal it is still counting in the
 * groceries is worse than one showing a day the range did not ask for.
 */
export const planSections = (dates: Date[], meals: PlannedMeal[], today: Date): DaySection[] => {
  const days = [...dates];

  for (const meal of meals)
    if (!days.some((day) => isSameDay(day, meal.date))) days.push(meal.date);

  return days
    .sort((first, second) => first.getTime() - second.getTime())
    .map((date) => ({
      date,
      status: dayStatusFor(date, today),
      meals: meals.filter((meal) => isSameDay(meal.date, date)),
    }));
};

type BuildOptions = {
  /**
   * Which unfilled slots on a future day get a plate of their own.
   *
   * The plan's own slots, not every slot: a household planning dinners only would otherwise be
   * offered an empty lunch every day of the week, on a question it has already answered. Pass `[]`
   * for a list of what was picked and nothing else.
   *
   * An option rather than a filter applied afterwards because `isDayStart` is decided while the
   * rows are built: strip the empties later and a day whose first row was one loses its date
   * marker entirely. Planned meals are never filtered by it — a slot switched off after the week
   * was generated still has plates on it, and hiding them would lose the meals silently.
   */
  emptySlots?: MealSlot[];
};

/**
 * The week as a flat list of plates.
 *
 * A day from today onwards shows an empty plate for each slot it has not filled — that is the
 * invitation to plan it. A past day shows only what was actually cooked: drawing the gaps behind
 * the user turns a week they lived into a week they failed, which is the one thing the planning
 * screen must never do.
 */
export const buildRows = (
  sections: DaySection[],
  today: Date,
  { emptySlots = MEAL_SLOTS }: BuildOptions = {},
): PlanningRow[] => {
  const todayStart = _startOfDay(today);

  return sections.flatMap((section) => {
    const isPast = _startOfDay(section.date) < todayStart;

    const rows: PlanningRow[] = MEAL_SLOTS.flatMap((slot) => {
      const planned = section.meals.filter((meal) => meal.slot === slot);

      if (planned.length > 0)
        return planned.map((meal): PlanningRow => ({
          kind: "meal",
          id: meal.id,
          date: section.date,
          dayStatus: section.status,
          isDayStart: false,
          meal,
        }));

      if (isPast || !emptySlots.includes(slot)) return [];

      return [{
        kind: "empty" as const,
        id: `${section.date.toDateString()}:${slot}`,
        date: section.date,
        dayStatus: section.status,
        isDayStart: false,
        slot,
      }];
    });

    const [first, ...rest] = rows;

    return first ? [{ ...first, isDayStart: true }, ...rest] : [];
  });
};

/**
 * Where the list should open.
 *
 * A day with nothing on it has no row of its own — the plan drops it — so the nearest row *after*
 * the date is the honest answer: asking for Wednesday and landing on Thursday is a day out, where
 * falling back to the top would land the user at the start of the week they scrolled away from.
 *
 * Past the last row there is no row after, so the nearest one is the last — the plan only runs to
 * its horizon, and a date beyond it belongs at the end, not back at the top.
 */
export const indexOfDate = (rows: PlanningRow[], date?: Date) => {
  if (!date || rows.length === 0) return 0;

  const target = _startOfDay(date);
  const index = rows.findIndex((row) => _startOfDay(row.date) >= target);

  return index === -1 ? rows.length - 1 : index;
};

/**
 * The plan without that plate.
 *
 * Removal, not emptying: the day keeps whatever else was on it, and `buildRows` draws it with one
 * plate instead of two. A day left with nothing simply stops appearing.
 */
export const removeMeal = (meals: PlannedMeal[], mealId: string): PlannedMeal[] =>
  meals.filter((meal) => meal.id !== mealId);

const _replaceOne = (
  meals: PlannedMeal[],
  mealId: string,
  change: (meal: PlannedMeal) => PlannedMeal,
): PlannedMeal[] => meals.map((meal) => (meal.id === mealId ? change(meal) : meal));

/**
 * Clamped rather than trusted: the slider cannot ask for a half portion or a zero one, but this is
 * what a route param or a future text field would reach next, and a plate for nobody is not a plate.
 */
const _clampServings = (servings: number) =>
  Math.min(Math.max(Math.round(servings), 1), MAX_SERVINGS);

/** The place at the table, without the dish: everything a plate knows that a recipe does not. */
export type Plate = {
  id: string;
  date: Date;
  slot: MealSlot;
  servings: number;
};

/**
 * A dish, served on that plate.
 *
 * The one place a `PlannedMeal` is built from a `Recipe`, so putting a dish on an empty slot and
 * swapping the dish already on one cannot disagree about what a plate made of that recipe is. The
 * ingredients are copied rather than shared: two plates of the same dish holding the catalogue's
 * own array would edit each other.
 */
const _plated = (plate: Plate, recipe: Recipe): PlannedMeal => ({
  ...recipe,
  ingredients: [...recipe.ingredients],
  id: plate.id,
  recipeId: recipe.id,
  date: plate.date,
  slot: plate.slot,
  servings: _clampServings(plate.servings),
});

/**
 * A dish put on a slot that had none.
 *
 * The counterpart to `removeMeal`, and the reason removing is not a dead end: a plate dropped from
 * the week leaves its slot empty, and the list draws that slot as an invitation to fill it again.
 * Appended rather than inserted in date order — `planSections` groups by day, so the position in
 * this array is not what decides where the plate is drawn.
 */
export const addMeal = (meals: PlannedMeal[], plate: Plate, recipe: Recipe): PlannedMeal[] => [
  ...meals,
  _plated(plate, recipe),
];

/**
 * How many that one plate is cooked for.
 *
 * It does not touch the ingredient amounts — see `groceriesFor`, which still sums what the recipe
 * was written for.
 */
export const setMealServings = (
  meals: PlannedMeal[],
  mealId: string,
  servings: number,
): PlannedMeal[] =>
  _replaceOne(meals, mealId, (meal) => ({ ...meal, servings: _clampServings(servings) }));

/**
 * A different dish on the same plate.
 *
 * The plate keeps its id, its day, its slot and the portions it was set to; everything the dish
 * decides comes from the recipe. Swapping the whole meal out for a new one instead would move it
 * to the end of the week and drop the portions the user had just chosen.
 */
export const replaceMeal = (
  meals: PlannedMeal[],
  mealId: string,
  recipe: Recipe,
): PlannedMeal[] => _replaceOne(meals, mealId, (meal) => _plated(meal, recipe));

/** Case as well as accents — a recipe title is matched, not indexed, so nothing else reads it. */
const _fold = (value: string) => foldAccents(value).toLowerCase();

/**
 * Whether a title answers what was typed.
 *
 * Accent- and case-insensitive: `Gnocchis à poêler` has to be found by typing `poeler`, because
 * the recipes are French and the keyboard reaching for them frequently is not. An empty query
 * matches everything — a search box nobody has typed in is not a filter.
 */
export const matchesQuery = (text: string, query: string) => {
  const needle = _fold(query.trim());

  return needle.length === 0 || _fold(text).includes(needle);
};

const _categoryRank = (id: string) => {
  const index = (CATEGORY_ORDER as readonly string[]).indexOf(id);

  return index === -1 ? CATEGORY_ORDER.length : index;
};

/**
 * What the chosen meals add up to, by category.
 *
 * Lines merge on ingredient *and* unit: 500g and 4 pieces of the same thing are two rows, because
 * nothing here knows how many grams a piece weighs. Merging them would invent a number.
 */
export const groceriesFor = (meals: PlannedMeal[]): GroceryCategory[] => {
  const rows = new Map<string, GroceryRow>();
  const categories = new Map<string, string[]>();

  for (const meal of meals)
    for (const ingredient of meal.ingredients) {
      const id = `${ingredient.id}:${ingredient.unit}`;
      const existing = rows.get(id);

      if (existing) {
        existing.amount += ingredient.amount;
        if (!existing.mealIds.includes(meal.id)) existing.mealIds.push(meal.id);
        continue;
      }

      rows.set(id, {
        id,
        name: ingredient.name,
        emoji: ingredient.emoji,
        amount: ingredient.amount,
        unit: ingredient.unit,
        pricePerKg: ingredient.pricePerKg,
        mealIds: [meal.id],
      });

      const seen = categories.get(ingredient.category);
      if (seen) seen.push(id);
      else categories.set(ingredient.category, [id]);
    }

  return [...categories.entries()]
    .sort(([a], [b]) => _categoryRank(a) - _categoryRank(b) || a.localeCompare(b))
    .map(([id, rowIds]) => ({
      id,
      rows: rowIds.map((rowId) => rows.get(rowId)!),
    }));
};

/**
 * A `YYYY-MM-DD` route param, or nothing.
 *
 * Anything else is ignored rather than trusted: a date is untrusted text on the way in, and an
 * `Invalid Date` reaching the list would compare false against every row and silently open at the
 * top. Parsed at local midnight so the day means the user's day, not UTC's.
 *
 * The parsed date is read back and compared, because `Date` does not reject an impossible day —
 * it rolls it over, turning `2026-02-31` into March 2nd and opening the list a week from where
 * the caller asked. Only a value that survives the round trip is the day it claimed to be.
 */
export const parseDateParam = (value?: string | string[]): Date | undefined => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, dayOfMonth] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(year, month - 1, dayOfMonth);

  const isTheDayItClaimed =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === dayOfMonth;

  return isTheDayItClaimed ? parsed : undefined;
};

/** The inverse, kept beside its parser so the two formats cannot drift apart. */
export const toDateParam = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

/**
 * A slot name off a route, or nothing.
 *
 * Matched against the slots that exist rather than cast to one: a link carrying `slot=brunch`
 * would otherwise reach the plan as a slot nothing draws, and the plate it created would be
 * invisible in a list built from `MEAL_SLOTS`.
 */
export const parseMealSlot = (value?: string | string[]): MealSlot | undefined =>
  MEAL_SLOTS.find((slot) => slot === value);

/**
 * The id a plate takes when it is created to fill an empty slot.
 *
 * Derived from the slot it fills rather than generated, so the same empty plate tapped twice
 * cannot end up as two plates on one slot — and so the plate a sheet has just created is findable
 * again by a screen that only knows the day and the meal it was for.
 */
export const plateIdFor = (date: Date, slot: MealSlot) => `${toDateParam(date)}:${slot}`;
