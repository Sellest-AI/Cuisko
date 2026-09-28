import type { Category } from "@shared/categories";

import type { PantryRow } from "./pantry";

/**
 * Everything the onboarding shows, and nothing fetched: the flow runs before a new account owns a
 * single thing, and it must look the same on every run.
 *
 * Ids only. What each one is called lives in `translations/{en,fr}/onboarding.json`, keyed by the
 * same id, so the demo reads in the user's language like the rest of the app. The fixtures hang
 * together as one story, which `__tests__/fixtures.test.ts` holds them to: the carrots and onions
 * added on the groceries screen are what the cosy search cooks from.
 *
 * **The recipes are real catalogue dishes**, with their real photo (bundled in `photos.ts`) and
 * their real total time. Their `lines` are not the whole recipe: only the ingredients the story
 * leans on, which is all any screen reads.
 */

export type IngredientId =
  | "carrot"
  | "onion"
  | "potato"
  | "cream"
  | "gruyere"
  | "beef"
  | "egg"
  | "rice"
  | "chicken"
  | "sausage"
  | "mushroom";

/** Stand-ins for the produce photos, as the real grocery cards use until theirs exist. */
export const INGREDIENT_EMOJI: Record<IngredientId, string> = {
  carrot: "🥕",
  onion: "🧅",
  potato: "🥔",
  cream: "🥛",
  gruyere: "🧀",
  beef: "🥩",
  egg: "🥚",
  rice: "🍚",
  chicken: "🍗",
  sausage: "🌭",
  mushroom: "🍄",
};

/** The aisle each one sits in, as a recipe line carries it: the cooking screen groups by it. */
export const INGREDIENT_CATEGORY: Record<IngredientId, Category> = {
  carrot: "VEGETABLE",
  onion: "VEGETABLE",
  potato: "VEGETABLE",
  cream: "DAIRY",
  gruyere: "DAIRY",
  beef: "MEAT",
  egg: "EGG",
  rice: "GRAIN",
  chicken: "MEAT",
  sausage: "MEAT",
  mushroom: "VEGETABLE",
};

type Line = PantryRow & { ingredient: IngredientId };

export type RecipeId =
  | "gratin"
  | "tartiflette"
  | "hachis-parmentier"
  | "bangers-and-mash"
  | "ribollita"
  | "mushroom-risotto"
  | "beef-noodles"
  | "spanish-tortilla"
  | "chili-con-carne"
  | "salad-nicoise"
  | "tikka-masala";

/** `minutes` is the catalogue dish's preparation and cooking added up. */
type FixtureRecipe = { id: RecipeId; minutes: number; lines: Line[] };

const g = (ingredient: IngredientId, quantity: number): Line => ({ ingredient, quantity, unit: "g" });
const cl = (ingredient: IngredientId, quantity: number): Line => ({ ingredient, quantity, unit: "cl" });
const pieces = (ingredient: IngredientId, quantity: number): Line => ({
  ingredient,
  quantity,
  unit: "pcs",
});

/** Every one a plate, per PRODUCT.md: a dish people sit down to as the meal, not a side. */
export const RECIPES: Record<RecipeId, FixtureRecipe> = {
  gratin: { id: "gratin", minutes: 95, lines: [pieces("potato", 3), cl("cream", 20), g("gruyere", 100)] },
  tartiflette: {
    id: "tartiflette",
    minutes: 65,
    lines: [pieces("potato", 4), cl("cream", 20), pieces("onion", 1)],
  },
  "hachis-parmentier": {
    id: "hachis-parmentier",
    minutes: 45,
    lines: [pieces("potato", 4), cl("cream", 10), g("beef", 400), pieces("onion", 1)],
  },
  "bangers-and-mash": {
    id: "bangers-and-mash",
    minutes: 40,
    lines: [pieces("potato", 4), pieces("onion", 2), pieces("sausage", 6)],
  },
  ribollita: { id: "ribollita", minutes: 41, lines: [g("carrot", 200), pieces("onion", 1)] },
  "mushroom-risotto": {
    id: "mushroom-risotto",
    minutes: 65,
    lines: [g("rice", 300), g("mushroom", 300), pieces("onion", 1)],
  },
  "beef-noodles": { id: "beef-noodles", minutes: 15, lines: [g("beef", 300)] },
  "spanish-tortilla": {
    id: "spanish-tortilla",
    minutes: 35,
    lines: [pieces("potato", 3), pieces("onion", 1), pieces("egg", 6)],
  },
  "chili-con-carne": { id: "chili-con-carne", minutes: 45, lines: [g("beef", 400), pieces("onion", 1)] },
  "salad-nicoise": { id: "salad-nicoise", minutes: 40, lines: [pieces("egg", 4)] },
  "tikka-masala": {
    id: "tikka-masala",
    minutes: 55,
    lines: [g("chicken", 500), cl("cream", 20), pieces("onion", 1)],
  },
};

/** Screen 2's two hints, in the order they slide past: a weight, then a count. Two, so the list stays short. */
export const GROCERY_HINTS = [
  { id: "carrots", row: g("carrot", 500) },
  { id: "onions", row: pieces("onion", 2) },
] as const;

/** Screen 3's two hints, one per kind of search: ingredients, then a mood. Two, so it goes quickly. */
export const RECIPE_SEARCHES = [
  { id: "potatoes-cream", results: ["tartiflette", "hachis-parmentier"] },
  { id: "cosy", results: ["bangers-and-mash", "ribollita", "mushroom-risotto"] },
] as const satisfies readonly { id: string; results: readonly RecipeId[] }[];

/** What screen 3 shows before the first search, so its grid opens as the page does, not empty. */
export const SUGGESTED: readonly RecipeId[] = ["spanish-tortilla", "chili-con-carne", "salad-nicoise", "tikka-masala"];

/** The recipe screen 5 plans and screen 6 cooks: one recipe carried through both. */
export const IMPORTED_RECIPE: RecipeId = "gratin";

/** Screen 5's grid: the days it offers from tomorrow, and the two already holding a dish. */
export const PLAN_DAYS = 6;
export const PLANNED: readonly { day: number; recipe: RecipeId }[] = [
  { day: 1, recipe: "mushroom-risotto" },
  { day: 4, recipe: "salad-nicoise" },
];

/** Screen 7's generated week, dinners from tomorrow. */
export const WEEK: readonly RecipeId[] = [
  "spanish-tortilla",
  "salad-nicoise",
  "gratin",
  "chili-con-carne",
  "beef-noodles",
];

/** Screen 7's one swap: the day it lands on (the second, near the top, where the eye already is), and what it brings. */
export const WEEK_SWAP = { day: 1, recipe: "tikka-masala" } as const satisfies {
  day: number;
  recipe: RecipeId;
};

