import { env } from "@convex/env";

import type { IngredientNutrition } from "@shared/nutrition";
import {
  measuredCount,
  measuredNutrition,
  type LookupHit,
  type MeasuredNutrition,
} from "./lookupHit";

/** Matches `openFoodFacts.ts` — the two run side by side, so the slower one sets the wait. */
const TIMEOUT_MS = 4_000;

const PAGE_SIZE = 5;

const ENDPOINT = "https://api.nal.usda.gov/fdc/v1/foods/search";

/**
 * The two USDA datasets that hold raw, generic ingredients: `Foundation` is the current
 * analytical programme, `SR Legacy` the older reference table that still covers most of the
 * kitchen. The other two — `Branded` and `Survey (FNDDS)` — are packaged products and modelled
 * recipes, which is the corpus Open Food Facts already covers better and in French.
 */
const DATA_TYPES = "Foundation,SR Legacy";

/**
 * USDA nutrient numbers, which are stable across releases in a way the names are not — the same
 * nutrient is "Energy" in one dataset and "Energy (Atwater General Factors)" in another.
 */
const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  fat: 1004,
  saturatedFat: 1258,
  carbohydrates: 1005,
  sugars: 2000,
  fiber: 1079,
  sodium: 1093,
  /** "Iron, Fe". Not a Nutri-Score input; it decides the `iron-rich` tag. */
  iron: 1089,
} as const satisfies Record<keyof IngredientNutrition, number>;

/**
 * The unit each field must arrive in to be the number the schema stores. Checked rather than
 * assumed: `Energy` is published in KCAL on most foods and in KJ on some, and a kilojoule figure
 * accepted as kilocalories overstates energy by 4.2× straight onto a Nutri-Score.
 */
const UNITS = {
  calories: "KCAL",
  protein: "G",
  fat: "G",
  saturatedFat: "G",
  carbohydrates: "G",
  sugars: "G",
  fiber: "G",
  sodium: "MG",
  iron: "MG",
} as const satisfies Record<keyof IngredientNutrition, string>;

type FoodNutrient = { nutrientId?: number; value?: number; unitName?: string };

type Food = { description?: string; foodNutrients?: FoodNutrient[] };

const _nutrition = (food: Food): MeasuredNutrition | undefined => {
  const byId = new Map((food.foodNutrients ?? []).map((it) => [it.nutrientId, it]));

  const facts: Partial<Record<keyof IngredientNutrition, number>> = {};
  for (const [field, id] of Object.entries(NUTRIENT_IDS) as [keyof IngredientNutrition, number][]) {
    const nutrient = byId.get(id);
    if (nutrient?.unitName !== UNITS[field]) continue;
    facts[field] = nutrient.value;
  }

  return measuredNutrition(facts);
};

/**
 * USDA FoodData Central — clean per-100g figures for raw ingredients, measured in a laboratory.
 *
 * **English only, and that is the shape of its usefulness.** It answers the food the shipped
 * datasets could not name at all, in the language the taxonomy would have bridged if it had known
 * the word. So it runs beside Open Food Facts rather than after it: neither is reliably better
 * than the other on the long tail, and running them in sequence would double a shopper's wait to
 * learn nothing.
 *
 * The one source in this slice needing a key, which is the one reason `convex/env.ts` changes —
 * required and Zod-validated, so a deployment without it refuses to start rather than quietly
 * resolving one source short (ADR 0005).
 *
 * Returns `undefined` on any failure, for the reason `searchOpenFoodFacts` does: a source that is
 * down is a source that did not answer, and the resolver has others.
 */
export const searchFoodDataCentral = async (text: string): Promise<LookupHit | undefined> => {
  const url =
    `${ENDPOINT}?query=${encodeURIComponent(text)}` +
    `&dataType=${encodeURIComponent(DATA_TYPES)}&pageSize=${PAGE_SIZE}` +
    `&api_key=${encodeURIComponent(env.FDC_API_KEY)}`;

  let foods: Food[];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return undefined;

    const body: unknown = await response.json();
    foods = (body as { foods?: Food[] }).foods ?? [];
  } catch {
    // Same trade as Open Food Facts: the shopper is not told about somebody else's outage.
    return undefined;
  }

  const named = foods
    .map((food) => food.description?.trim())
    .filter((name): name is string => Boolean(name));

  if (!named.length) return undefined;

  // The food that measured the MOST of the nine wins, and its own name leads the list — the
  // caller re-searches the catalog in order, so the name the nutrition belongs to has to be the
  // one it tries first. Most rather than first-complete because a partial table is now kept, and
  // a food measured on seven fields is a better answer than one measured on two.
  const best = foods.reduce<{ name?: string; nutrition?: MeasuredNutrition } | undefined>(
    (winner, food) => {
      const nutrition = _nutrition(food);
      if (winner && measuredCount(nutrition) <= measuredCount(winner.nutrition)) return winner;

      return { name: food.description?.trim(), nutrition };
    },
    undefined,
  );

  const leading = best?.name ? [best.name, ...named] : named;

  // English, stated rather than inferred: USDA publishes in one language and the header on this
  // file says so. That is what lets a row built from this fill `names.en` without a model.
  return {
    source: "foodComposition",
    names: { en: [...new Set(leading)] },
    // A keyword search, so these names are evidence and never vocabulary — see `searched`.
    searched: true,
    nutrition: best?.nutrition,
    // Which of the five the figures belong to, stated rather than implied by being first in the
    // list — USDA ran a keyword search, so this is the claim that has to be checkable. English for
    // the same reason `names` is: this source publishes in one language.
    measuredAs: best?.name ? [{ name: best.name, locale: "en" as const }] : [],
  };
};
