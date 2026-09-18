/**
 * The planning domain: what a planned week is made of, and the derivations drawn from it.
 *
 * Framework-free — no React, no Jotai, no Convex (see `src/modules/AGENTS.md`). The one component
 * import is a type, erased at build time, so this file still runs and tests without a
 * provider tree.
 */

import type { Category } from "@shared/categories";
import type { Unit } from "@shared/ingredients";
import { toggle } from "@shared/helpers";
import { MEAL_SLOTS as MEAL_SLOT_VOCABULARY, type MealSlot } from "@shared/mealSlots";

import type { ImageProps } from "@ui/image";

/** Whatever `@ui/image` accepts, named here so `_model/` depends on no component. */
export type ImageSource = ImageProps["source"];

/**
 * Re-exported rather than declared: the slots are a shared vocabulary now, because the household's
 * `defaultSlots` column is validated against the same list (`@shared/mealSlots`). Every planning
 * caller keeps importing it from here, where the rest of the domain lives.
 */
export type { MealSlot };

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

/**
 * One line of a generated plate, as `getDraft` answers it.
 *
 * `amount` / `unit` are the recipe's own words scaled to the plate — "2 pcs", never the grams stock
 * is counted in. `category` is the catalog's, folded onto a grocery heading by `groceryHeadingOf`.
 */
export type DraftIngredient = {
  ingredientId: string;
  name: string;
  emoji: string;
  category: Category;
  imageUrl?: string;
  amount: number;
  unit: Unit;
  /** What the cellar already holds, after what the week's earlier plates took. */
  covered: boolean;
};

/** A dish the swap sheet offers first for a generated plate: one of the plate's runners-up. */
export type DraftAlternative = {
  recipeId: string;
  title: string;
  imageUrl?: string;
};

/**
 * A plate of the week the tunnel generated and nobody has agreed to yet.
 *
 * The server's `DraftMeal` with two differences, both made where it lands (`usePlanDraft`): the day
 * is a `Date`, and `id` names the plate — `plateIdFor` its day and slot, which is unique within a
 * draft and is the same id the sheet gives a plate it creates on that slot.
 *
 * No `status`, no `emoji`, no price: status is a derivation of `covered`, a recipe has no emoji
 * column, and nothing in the schema carries a price.
 */
export type DraftMeal = {
  id: string;
  recipeId: string;
  date: Date;
  slot: MealSlot;
  servings: number;
  title: string;
  minutes?: number;
  imageUrl?: string;
  ingredients: DraftIngredient[];
  /**
   * The dishes that came closest to this plate when the week was generated, best first. Empty on a
   * plate the cook swapped or created: `getDraftMeal` answers one dish, not a ranking.
   */
  alternatives: DraftAlternative[];
};

/**
 * What a plate in a list is drawn from — the kept week's and the draft's alike.
 *
 * A projection rather than a shared meal type: the two weeks store different things, and the row
 * only needs this much of either. `PlannedMeal` satisfies it as it stands; a draft goes through
 * `toMealCard`.
 */
export type MealCard = {
  id: string;
  recipeId: string;
  date: Date;
  slot: MealSlot;
  title: string;
  minutes?: number;
  servings: number;
  status: MealStatus;
  emoji?: string;
  imageSrc?: ImageSource;
};

/** Anything a list can place on a day: the plate's id, its day and its slot. */
type Dated = { id: string; date: Date; slot: MealSlot };

export type DaySection<M extends Dated = PlannedMeal> = {
  date: Date;
  status: DayStatus;
  meals: M[];
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
export type PlanningRow<M extends Dated = PlannedMeal> =
  | (RowBase & { kind: "meal"; meal: M })
  | (RowBase & { kind: "empty"; slot: MealSlot });

export type GroceryRow = {
  /** Ingredient and unit together: two units of one ingredient cannot share a line. */
  id: string;
  /** Carried rather than parsed back out of `id`, which is a key and not a pair of fields. */
  ingredientId: string;
  name: string;
  emoji: string;
  imageUrl?: string;
  /**
   * What this row is asking for.
   *
   * On a missing row, the part of the week the cellar did NOT reach — not everything the week wants
   * of it. A cupboard holding three onions against a week wanting three on Monday and three on
   * Thursday is asked for three, which is what `commit` will buy; the full six would be the page
   * charging the shopper for what they already own. On a covered row it is the whole of it, since
   * nothing there is being asked for at all.
   */
  amount: number;
  unit: Unit;
  /** The meals needing it, drawn as the stack of little plates under the name. */
  mealIds: string[];
  /**
   * The cellar covers this row for **every** meal that asked for it.
   *
   * All of them, not any: the week is served in order and the stock runs down as it goes, so a row
   * two plates share can be covered for Monday and short by Thursday. That row is something to buy.
   */
  covered: boolean;
};

export type GroceryCategory = { id: string; rows: GroceryRow[] };

/**
 * What a week's plates add up to, split by whether the kitchen already has it.
 *
 * Two lists rather than one flag on the rows, because the page draws them apart: what to buy is the
 * page, and what the cellar already covers is the reassurance under it — the answer to "so what did
 * planning from my cupboards actually save me?".
 */
export type GroceryList = {
  /** What is missing, by category — the list the shopper takes out. */
  missing: GroceryCategory[];
  /** What the cellar already covers, flat and in category order. Nothing here is bought. */
  covered: GroceryRow[];
};

/**
 * Every plate a day can hold, in the order a day is eaten.
 *
 * Exported because the setup step offers the same list to choose from: a second copy there would
 * be free to drift, and the day a third slot exists the two would disagree about what a day is.
 */
export const MEAL_SLOTS: MealSlot[] = [...MEAL_SLOT_VOCABULARY];

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

/**
 * The grocery heading a catalog category is shopped under.
 *
 * The catalog has sixteen categories and the list has six headings, so this folds rather than
 * renames: a herb is bought with the vegetables, an egg beside the meat. A `Record` over the whole
 * vocabulary, so a seventeenth category fails to compile here instead of drawing as "other".
 */
const GROCERY_HEADING: Record<Category, CategoryId> = {
  VEGETABLE: "vegetables",
  FRUIT: "vegetables",
  HERB: "vegetables",
  MEAT: "meats",
  EGG: "meats",
  SEAFOOD: "fish",
  DAIRY: "dairy",
  GRAIN: "grains",
  LEGUME: "grains",
  NUT: "other",
  SEED: "other",
  SPICE: "other",
  OIL: "other",
  CONDIMENT: "other",
  SWEETENER: "other",
  OTHER: "other",
};

export const groceryHeadingOf = (category: Category): CategoryId => GROCERY_HEADING[category];

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

/**
 * Local midnight of that day.
 *
 * Exported because the two hooks that talk to the server both need it: a plan's dates and its
 * `today` are local-day timestamps — "Tuesday" has to mean the user's Tuesday — and a second copy
 * beside either of them is where the draft and the commit would start disagreeing about which day
 * it is.
 */
export const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * The days a plan covers: the day after `after`, onwards.
 *
 * `after` is the later of today and the household's latest kept plate, so a week continues the one
 * already there rather than stacking a second lunch on days that have one. Today itself is never
 * offered — a plan made at dinner time cannot shop for a lunch already eaten, so the offer starts
 * on the first day it can still be kept. Shared with the generation rather than each side counting
 * its own days, because a plan whose list covers a day its meals do not would hide a meal at one
 * end and offer an unfillable day at the other.
 */
export const planDates = (after: Date, days: number): Date[] =>
  Array.from({ length: days }, (_, index) => addDays(after, index + 1));

/**
 * The day a new week counts from: today, or the latest kept plate when that is further on.
 *
 * `lastDate` is the server's answer as a local-day timestamp, or `null` for a household that has
 * never kept a plate; either way a day behind today falls back to today, so the week never starts
 * in the past.
 */
export const planAfter = (today: Date, lastDate: number | null): Date =>
  lastDate === null || lastDate <= today.getTime() ? today : startOfDay(new Date(lastDate));

/**
 * How far a day has got, from where it sits against today.
 *
 * Derived rather than stored, because it is the calendar's answer and not the plan's: a day behind
 * the user is done with whatever it held, and a day ahead is still open however full it looks. The
 * day per-meal status is a different question, and `MealStatus` answers that one.
 */
export const dayStatusFor = (date: Date, today: Date): DayStatus => {
  const day = startOfDay(date);
  const now = startOfDay(today);

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
export const planSections = <M extends Dated>(dates: Date[], meals: M[], today: Date): DaySection<M>[] => {
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
export const buildRows = <M extends Dated>(
  sections: DaySection<M>[],
  today: Date,
  { emptySlots = MEAL_SLOTS }: BuildOptions = {},
): PlanningRow<M>[] => {
  const todayStart = startOfDay(today);

  return sections.flatMap((section) => {
    const isPast = startOfDay(section.date) < todayStart;

    const rows: PlanningRow<M>[] = MEAL_SLOTS.flatMap((slot) => {
      const planned = section.meals.filter((meal) => meal.slot === slot);

      if (planned.length > 0)
        return planned.map((meal): PlanningRow<M> => ({
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
export const indexOfDate = <M extends Dated>(rows: PlanningRow<M>[], date?: Date) => {
  if (!date || rows.length === 0) return 0;

  const target = startOfDay(date);
  const index = rows.findIndex((row) => startOfDay(row.date) >= target);

  return index === -1 ? rows.length - 1 : index;
};

/**
 * The plan without that plate.
 *
 * Removal, not emptying: the day keeps whatever else was on it, and `buildRows` draws it with one
 * plate instead of two. A day left with nothing simply stops appearing.
 */
export const removeMeal = <M extends Plate>(meals: M[], mealId: string): M[] =>
  meals.filter((meal) => meal.id !== mealId);

const _replaceOne = <M extends Plate>(meals: M[], mealId: string, change: (meal: M) => M): M[] =>
  meals.map((meal) => (meal.id === mealId ? change(meal) : meal));

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
 * A dish put on a slot that had none.
 *
 * The counterpart to `removeMeal`, and the reason removing is not a dead end: a plate dropped from
 * the week leaves its slot empty, and the list draws that slot as an invitation to fill it again.
 * Appended rather than inserted in date order — `planSections` groups by day, so the position in
 * this array is not what decides where the plate is drawn.
 */
export const addMeal = <M extends Plate>(meals: M[], meal: M): M[] => [
  ...meals,
  { ...meal, servings: _clampServings(meal.servings) },
];

/**
 * How many that one plate is cooked for.
 *
 * It does not touch the ingredient amounts — see `groceriesFor`, which still sums what the recipe
 * was written for.
 */
export const setMealServings = <M extends Plate>(meals: M[], mealId: string, servings: number): M[] =>
  _replaceOne(meals, mealId, (meal) => ({ ...meal, servings: _clampServings(servings) }));

/**
 * A different dish on the same plate.
 *
 * The plate keeps its id, its day, its slot and the portions it was set to; everything the dish
 * decides comes from `plated`, which is handed that plate. Swapping the whole meal out for a new one
 * instead would move it to the end of the week and drop the portions the user had just chosen.
 */
export const replaceMeal = <M extends Plate>(meals: M[], mealId: string, plated: (plate: Plate) => M): M[] =>
  _replaceOne(meals, mealId, (meal) => {
    const swapped = plated({ id: meal.id, date: meal.date, slot: meal.slot, servings: meal.servings });

    return { ...swapped, servings: _clampServings(swapped.servings) };
  });

/**
 * A draft plate as a list draws it.
 *
 * Ready when the cellar covers every line, shopping otherwise — the same two states a kept plate
 * carries, derived here because the draft stores coverage and not a verdict.
 */
export const toMealCard = (meal: DraftMeal): MealCard => ({
  id: meal.id,
  recipeId: meal.recipeId,
  date: meal.date,
  slot: meal.slot,
  title: meal.title,
  minutes: meal.minutes,
  servings: meal.servings,
  status: meal.ingredients.every((ingredient) => ingredient.covered) ? "ready" : "shopping-needed",
  imageSrc: meal.imageUrl ? { uri: meal.imageUrl } : undefined,
});

/**
 * A kept plate as the server answers it: `getMany` and `getPaginated` alike.
 *
 * Structural rather than imported, so this file stays free of Convex (see the header). The day is a
 * local-midnight timestamp, and `status` is already derived — see `PlannedMealCard` on the server.
 */
export type KeptMeal = {
  id: string;
  date: number;
  slot: MealSlot;
  servings: number;
  status: Exclude<MealStatus, "empty">;
  recipe: { id: string; title: string; minutes?: number; plateImageUrl?: string; coverImageUrl?: string };
};

/** A kept plate as a list draws it — the counterpart to `toMealCard` for the week already agreed to. */
export const keptMealCardOf = (meal: KeptMeal): MealCard => ({
  id: meal.id,
  recipeId: meal.recipe.id,
  date: new Date(meal.date),
  slot: meal.slot,
  title: meal.recipe.title,
  minutes: meal.recipe.minutes,
  servings: meal.servings,
  status: meal.status,
  imageSrc: meal.recipe.plateImageUrl ? { uri: meal.recipe.plateImageUrl } : undefined,
});

/**
 * Plates in the order a week is eaten: by day, then by slot within it.
 *
 * The index orders by day only, so two plates on one day come back in the order they were written —
 * which is not the order the carousel has to walk them in.
 */
export const inEatingOrder = <M extends Dated>(meals: M[]): M[] =>
  [...meals].sort((first, second) =>
    startOfDay(first.date).getTime() - startOfDay(second.date).getTime() ||
    MEAL_SLOTS.indexOf(first.slot) - MEAL_SLOTS.indexOf(second.slot));

/**
 * The days the planning list offers empty plates on: today, through the last day anything is planned.
 *
 * Never past it. Beyond the last planned day the week has not been generated, and a run of empty days
 * is an invitation to fill them one plate at a time — which is the tunnel's job, not the list's. Never
 * before today either: see `buildRows` on why a past gap is not drawn.
 */
export const openDates = (today: Date, meals: Dated[]): Date[] => {
  const start = startOfDay(today);
  const last = meals.reduce(
    (latest, meal) => Math.max(latest, startOfDay(meal.date).getTime()),
    start.getTime(),
  );

  const dates: Date[] = [];
  for (let date = start; date.getTime() <= last; date = addDays(date, 1)) dates.push(date);

  return dates;
};

const _categoryRank = (id: string) => {
  const index = (CATEGORY_ORDER as readonly string[]).indexOf(id);

  return index === -1 ? CATEGORY_ORDER.length : index;
};

/**
 * The row a line lands on: the ingredient and the unit it is written in, together.
 *
 * Named because two callers build it and one of them is a *lookup* — `ownedLinesOf` has to find the
 * lines behind a row the user ticked, and a second `${a}:${b}` written there would agree with this
 * one until somebody changed the key. Nothing parses it back apart; the fields are carried instead.
 */
const _rowIdFor = (ingredient: DraftIngredient) => `${ingredient.ingredientId}:${ingredient.unit}`;

/**
 * What the chosen meals add up to: what is missing, by category, and what the cellar already covers.
 *
 * Lines merge on ingredient *and* unit: 500g and 4 pieces of the same thing are two rows, because
 * nothing here knows how many grams a piece weighs. Merging them would invent a number.
 *
 * Coverage is the generation's answer, not this function's — a line knows whether the cellar reached
 * it, and a row merging several is only covered when all of them were. A row that is not fully
 * covered asks for its uncovered lines only, so the page and the list that `commit` writes agree
 * about what is being bought. What is finally asked for is still decided server-side, against the
 * cellar as it is then.
 *
 * ⚠️ It is still an approximation in one direction: a line the cellar part-covers counts in full,
 * because a `DraftIngredient` says whether it was covered and not by how much. It overstates that
 * line and never understates the row, which is the safe way round for a shopping list.
 */
export const groceriesFor = (meals: DraftMeal[]): GroceryList => {
  const rows = new Map<string, GroceryRow>();
  const categories = new Map<string, string[]>();
  /** What each row is short of, summed beside the total rather than derived from it. */
  const missingAmounts = new Map<string, number>();

  for (const meal of meals)
    for (const ingredient of meal.ingredients) {
      const id = _rowIdFor(ingredient);
      const heading = groceryHeadingOf(ingredient.category);
      const existing = rows.get(id);

      if (!ingredient.covered) {
        missingAmounts.set(id, (missingAmounts.get(id) ?? 0) + ingredient.amount);
      }

      if (existing) {
        existing.amount += ingredient.amount;
        existing.covered = existing.covered && ingredient.covered;
        if (!existing.mealIds.includes(meal.id)) existing.mealIds.push(meal.id);
        continue;
      }

      rows.set(id, {
        id,
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        emoji: ingredient.emoji,
        imageUrl: ingredient.imageUrl,
        amount: ingredient.amount,
        unit: ingredient.unit,
        mealIds: [meal.id],
        covered: ingredient.covered,
      });

      const seen = categories.get(heading);
      if (seen) seen.push(id);
      else categories.set(heading, [id]);
    }

  const inOrder = [...categories.entries()].sort(
    ([a], [b]) => _categoryRank(a) - _categoryRank(b) || a.localeCompare(b),
  );

  return {
    missing: inOrder
      .map(([id, rowIds]) => ({
        id,
        rows: rowIds
          .map((rowId) => rows.get(rowId)!)
          .filter((row) => !row.covered)
          // Asked for at what it is short of, which is what `commit` will buy — see `amount`.
          .map((row) => ({ ...row, amount: missingAmounts.get(row.id) ?? row.amount })),
      }))
      // A category whose every row is covered has nothing to shop for, so it heads nothing.
      .filter((category) => category.rows.length > 0),
    covered: inOrder.flatMap(([, rowIds]) => rowIds.map((rowId) => rows.get(rowId)!).filter((row) => row.covered)),
  };
};

/**
 * The ingredient-and-unit pairs behind the rows the shopper ticked — what `commit` takes as `owned`.
 *
 * Resolved from the lines rather than by splitting the row ids back up: the id is a key, and a
 * caller that took it apart would be depending on how this file happens to spell one.
 */
export const ownedLinesOf = (meals: DraftMeal[], rowIds: string[]) => {
  const wanted = new Set(rowIds);
  const pairs = new Map<string, { ingredientId: string; unit: Unit }>();

  for (const meal of meals)
    for (const ingredient of meal.ingredients) {
      const id = _rowIdFor(ingredient);

      if (wanted.has(id) && !pairs.has(id)) {
        pairs.set(id, { ingredientId: ingredient.ingredientId, unit: ingredient.unit });
      }
    }

  return [...pairs.values()];
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

/**
 * How many tastes one step accepts.
 *
 * A ceiling rather than an open list because the answer is a steer, not a filter: a user who ticks
 * everything has said nothing, and the generator would be weighing ten equal wishes against a week
 * of fourteen plates. Four is the most that still reads as a preference.
 *
 * Allergies are deliberately not subject to it — an exclusion list has to be complete or it is
 * worse than none at all.
 */
export const MAX_TASTES = 4;

/**
 * The same, under a ceiling: the pick that would overflow it is refused.
 *
 * Refusing rather than evicting the oldest: the rows past the ceiling are drawn disabled, so a
 * press that silently swapped one out would be the grid contradicting itself. Turning a taste off
 * is always allowed — that is how the user makes room for another.
 */
export const toggleTaste = <T extends string>(tastes: T[], id: T, max = MAX_TASTES): T[] =>
  tastes.includes(id) || tastes.length < max ? toggle(tastes, id) : tastes;

/**
 * How long the user has to cook on an average evening this week.
 *
 * Re-exported rather than defined here: the Convex validator behind `getDraft` is built from the
 * same literals the time step draws, and `src/` is unreachable from `convex/` — so the list lives
 * in `@shared/cookingTimes`, which is also where the rule that it is never stored is written down.
 */
export { COOKING_TIMES, type CookingTime } from "@shared/cookingTimes";

/**
 * A draft plate as the server answers it, made the draft's own: its day a `Date`, its id the plate
 * it fills.
 *
 * The one place a server plate becomes a `DraftMeal`, so a week `getDraft` generated and a dish
 * `getDraftMeal` swapped in cannot disagree about what a plate on that day and slot is called —
 * which is what lets the sheet find the plate it just created, and the review step replace one.
 *
 * Only `getDraft` sends alternatives; a dish `getDraftMeal` answers lands with none.
 */
export const draftMealOf = (
  meal: Omit<DraftMeal, "id" | "date" | "alternatives"> & { date: number; alternatives?: DraftAlternative[] },
): DraftMeal => {
  const date = new Date(meal.date);

  return { ...meal, id: plateIdFor(date, meal.slot), date, alternatives: meal.alternatives ?? [] };
};
