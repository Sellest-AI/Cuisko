/**
 * Every plate and ingredient this slice draws, invented here.
 *
 * Hardcoded on purpose: the interface comes first, so the screens are built against the shape they
 * will keep, and swapping in `api.router.planning.*` later touches the hooks in this folder alone
 * (ARCHITECTURE.md § Build order, ADR 0006).
 *
 * Read across the module — the hooks seed the atoms from it, and the tunnel steps draw their
 * images from it — but never from outside `planning/`, which is what keeps it private: it is data
 * about to be deleted, and another module binding to it would be building against a shape with a
 * known expiry date.
 *
 * Diet labels are English here rather than in `translations/`. They are catalogue data a real
 * backend will serve already translated, not interface copy — so a key per row would be a table to
 * delete rather than a table to keep. The utensil list that used to sit beside them is gone: the
 * kitchen now draws @shared/equipments, the same vocabulary a recipe declares.
 */

import type { Unit } from "@shared/ingredients";

import {
  addDays,
  planDates,
  type MealIngredient,
  type MealSlot,
  type PlannedMeal,
  type Recipe,
} from "../_model/model";

const PLATE = require("assets/placeholders/asparagus-plate.png");
const DISH = require("assets/placeholders/asparagus-plate.png");
const EMPTY_PLATE = require("assets/placeholders/empty-plate.png");

export const EMPTY_PLATE_IMAGE = EMPTY_PLATE;

const _ingredient = (
  id: string,
  name: string,
  category: string,
  emoji: string,
  amount: number,
  unit: Unit,
  pricePerKg?: number,
): MealIngredient => ({ id, name, category, emoji, amount, unit, pricePerKg });

const TOMATO = _ingredient("tomato", "Tomates", "vegetables", "🍅", 250, "g", 1.3);
const CARROT = _ingredient("carrot", "Carottes", "vegetables", "🥕", 2, "pcs", 1.3);
const MUSHROOM = _ingredient("mushroom", "Champignons", "vegetables", "🍄", 200, "g", 4.2);
const ASPARAGUS = _ingredient("asparagus", "Asperges", "vegetables", "🥬", 400, "g", 6.9);
const DUCK = _ingredient("duck", "Magret de canard", "meats", "🦆", 2, "pcs", 24.5);
const BACON = _ingredient("bacon", "Bacon", "meats", "🥓", 150, "g", 12.4);
const RICE = _ingredient("rice", "Riz", "grains", "🍚", 300, "g", 2.1);
const GNOCCHI = _ingredient("gnocchi", "Gnocchis", "grains", "🥔", 500, "g", 3.4);
const CREAM = _ingredient("cream", "Crème fraîche", "dairy", "🥛", 20, "cl", 3.8);

/** The four dishes the mockups run on, reused across days as a real week reuses recipes. */
const RECIPES = {
  duck: {
    title: "Magret de canard", minutes: 55, servings: 5, emoji: "🔥", imageSrc: DISH,
    ingredients: [DUCK, CARROT, CREAM],
  },
  asparagus: {
    title: "Asperges et bacon", minutes: 40, servings: 5, emoji: "🥢", imageSrc: PLATE,
    ingredients: [ASPARAGUS, BACON, CREAM],
  },
  mushroomRice: {
    title: "Riz aux champignons", minutes: 35, servings: 5, emoji: "🍲", imageSrc: DISH,
    ingredients: [RICE, MUSHROOM, TOMATO],
  },
  gnocchi: {
    title: "Gnocchis à poêler", minutes: 25, servings: 5, emoji: "🍳", imageSrc: PLATE,
    ingredients: [GNOCCHI, TOMATO, CREAM],
  },
} as const;

type RecipeKey = keyof typeof RECIPES;

/** A plate before it knows which day it lands on. The date arrives when the plan is materialised. */
type Planned = {
  key: RecipeKey;
  slot: PlannedMeal["slot"];
  status: PlannedMeal["status"];
  id: string;
};

const _plate = (
  key: RecipeKey,
  slot: PlannedMeal["slot"],
  status: PlannedMeal["status"],
  id: string,
): Planned => ({ key, slot, status, id });

const _materialise = (planned: Planned, date: Date): PlannedMeal => ({
  ...RECIPES[planned.key],
  id: planned.id,
  /** The dish's own key: the swap sheet marks a tile selected by matching against it. */
  recipeId: planned.key,
  slot: planned.slot,
  status: planned.status,
  date,
  ingredients: [...RECIPES[planned.key].ingredients],
});

/** Days either side of today the placeholder week covers. */
const DAYS_BEFORE = 6;
const DAYS_AFTER = 2;

/**
 * A plausible week: cooked behind, plannable ahead, and today caught mid-stride with one meal
 * ready and one still needing a shop.
 */
const PLAN: Record<number, Planned[]> = {
  [-6]: [_plate("mushroomRice", "lunch", "cooked", "m6"), _plate("gnocchi", "dinner", "cooked", "d6")],
  [-5]: [_plate("duck", "dinner", "cooked", "d5")],
  [-4]: [_plate("asparagus", "lunch", "cooked", "l4"), _plate("duck", "dinner", "cooked", "d4")],
  [-2]: [_plate("mushroomRice", "lunch", "cooked", "l2"), _plate("gnocchi", "dinner", "cooked", "d2")],
  [-1]: [_plate("mushroomRice", "lunch", "cooked", "l1"), _plate("gnocchi", "dinner", "cooked", "d1")],
  [0]: [_plate("asparagus", "lunch", "shopping-needed", "l0"), _plate("duck", "dinner", "ready", "d0")],
  [1]: [_plate("duck", "lunch", "ready", "l1a"), _plate("asparagus", "dinner", "shopping-needed", "d1a")],
  [2]: [_plate("mushroomRice", "lunch", "shopping-needed", "l2a")],
};

/**
 * One clock for the seeded week.
 *
 * The plan is state now, so it is seeded once at module load rather than rebuilt on every mount
 * that reads it — and one clock, so every plate in the seed agrees on which day is which.
 */
const SEEDED_TODAY = new Date();

/**
 * The seeded week as a flat list of plates, which is the shape the plan is stored in.
 *
 * Flat rather than grouped into days because a day is a derivation — `planSections` rebuilds it —
 * and a stored grouping would have to be re-cut every time a meal moved between two days.
 */
export const PLACEHOLDER_MEALS: PlannedMeal[] = Array.from(
  { length: DAYS_BEFORE + DAYS_AFTER + 1 },
  (_, index) => {
    const offset = index - DAYS_BEFORE;
    const date = addDays(SEEDED_TODAY, offset);

    return (PLAN[offset] ?? []).map((planned) => _materialise(planned, date));
  },
).flat();

/**
 * How far ahead the planning list offers empty plates.
 *
 * Short on purpose: past this the week has not been generated, and a run of empty days is an
 * invitation to fill them one at a time — which is the tunnel's job, not the list's.
 */
export const PLACEHOLDER_DAYS_AHEAD = DAYS_AFTER;

/**
 * The dishes the fake generation walks through, in order.
 *
 * A rotation rather than a fixed list of plates: the setup step now decides how many days and
 * which slots to fill, so the generation has to size itself to the answer. Four dishes is enough
 * that a full week of both meals never serves the same thing two plates running.
 */
const ROTATION = ["duck", "asparagus", "mushroomRice", "gnocchi"] as const satisfies readonly RecipeKey[];

/** Total by construction — the modulo cannot leave the tuple, so the fallback is unreachable. */
const _dishAt = (position: number): RecipeKey => ROTATION[position % ROTATION.length] ?? ROTATION[0];

/**
 * The generated week, sized by the setup step and each meal already carrying its day.
 *
 * Reading `days` and `slots` rather than emitting a fixed fortnight is what makes those two
 * questions worth asking: a user who says "three days, dinners only" and is handed a full week of
 * lunches back has been asked something the app then ignored.
 *
 * The date is decided here rather than by the screen that lists them, so dropping a meal in review
 * leaves every other meal on the day it was given. Deriving the day from a meal's position in the
 * array instead would reshuffle the whole week on one removal.
 *
 * The days come from `planDates` rather than being counted out again here: the review step lists
 * the same days to offer its empty plates on, and a week generated onto days that list does not
 * cover would show meals it cannot place beside slots nothing can fill.
 */
export const generatedMeals = (today: Date, days: number, slots: MealSlot[]): PlannedMeal[] =>
  planDates(today, days).map((date, day) =>
    slots.map((slot, index) => {
      const position = day * slots.length + index;

      /** Alternating, so the review and grocery steps both show a week that is part ready, part shop. */
      const status = position % 2 === 0 ? "ready" : "shopping-needed";

      return _materialise(_plate(_dishAt(position), slot, status, `gen${position}`), date);
    }),
  ).flat();

/**
 * Dishes past the four the week is built from, so the swap sheet searches a catalogue rather than
 * a shortlist. Their ingredients are borrowed from those four: a placeholder has to be plausible,
 * and twenty invented ingredient lists nobody reads are not what makes it so.
 */
const CATALOGUE_TITLES = [
  "Risotto aux cèpes",
  "Poulet rôti au citron",
  "Curry de pois chiches",
  "Saumon à l'unilatéral",
  "Tartiflette du dimanche",
  "Pâtes à la carbonara",
  "Ratatouille au four",
  "Velouté de potimarron",
  "Blanquette de veau",
  "Nouilles sautées au wok",
  "Quiche aux poireaux",
  "Chili sin carne",
] as const;

const _recipe = (id: string, key: RecipeKey, position: number, title?: string): Recipe => ({
  ...RECIPES[key],
  id,
  title: title ?? RECIPES[key].title,
  ingredients: [...RECIPES[key].ingredients],
  /** Alternating, so the grid shows both a dish ready to cook and one still needing a shop. */
  status: position % 3 === 0 ? "shopping-needed" : "ready",
});

/**
 * Every dish the swap sheet can put on a plate, the four the plan already serves first.
 *
 * Those four are keyed by the same `RecipeKey` `_materialise` stamps onto a plate — which is what
 * lets the sheet recognise the dish currently on it. Give them ids of their own and the tile the
 * user is replacing would never come up marked as the one they already have.
 */
export const RECIPE_CATALOGUE: Recipe[] = [
  ...ROTATION.map((key, index) => _recipe(key, key, index)),
  ...CATALOGUE_TITLES.map((title, index) =>
    _recipe(`catalogue${index}`, _dishAt(index), index + ROTATION.length, title)),
];

export const DIETS = [
  { id: "no-preference", label: "No preference" },
  { id: "pescatarian", label: "Pescatarian" },
  { id: "eggs", label: "Eggs" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten-free", label: "Gluten free" },
  { id: "lactose-free", label: "Lactose free" },
] as const;

/** One image for every tile until real produce photography exists. */
export const TILE_IMAGE = DISH;
export const MEAL_IMAGE = PLATE;

/** Cuisko itself. A plate stands in until the mascot artwork is in the repo. */
export const MASCOT = PLATE;
