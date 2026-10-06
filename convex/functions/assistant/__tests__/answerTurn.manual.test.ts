"use node"
/**
 * Does the assistant reach for the right tool, with the right data? One table per model, so a
 * faster or cheaper one can be put beside the one that ships before it replaces it.
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — every case is a real multi-step turn on OpenRouter, once per
 * candidate per run. Run it by hand, when you are choosing the assistant's model:
 *
 *     pnpm test:manual answerTurn
 *
 * The file name is what keeps it to this file. Without it, or written after a `--`, every manual
 * test runs, bake-offs and their judges included.
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`); the one
 * the runner injects is a placeholder, and the first assertion says so.
 *
 * **Real where the model decides, scripted where the database would answer.** The system prompt is
 * `assistantPrompt`, and each tool is the one `answerTurn` registers — same name, description and
 * input schema — run through its own `run`, so the id checks, the thrown errors and the output shape
 * the model reads back are the app's own. Only `ctx.runQuery` is fake: it serves the catalog below
 * instead of Convex. That is what makes a case assertable at all — "display shows the bolognaise"
 * needs the bolognaise to have an id the test knows.
 *
 * **Scripted, and so a little kinder than production.** The fake search matches words, not the
 * real ranking, and the catalog holds ten recipes rather than thousands. A model that fails here
 * fails in the app; one that passes here has passed the part the model owns, not the search.
 *
 * **What is scored is the tool trajectory, never the prose.** Each case says which tools must be
 * called and with what, and `_invariants` adds what holds for every turn (no id in the text, no id
 * carried from nowhere, no failed call, the button last). A run passes when both find nothing.
 *
 * The output is a table in the terminal — case × model, one mark per run, then speed and cost per
 * model — and a markdown file under `convex/agent/__bench__/runs/` (gitignored) holding every
 * failed turn in full: each call, its input, what came back, and the answer. Read that file before
 * blaming a model: a failure can as easily be a case asking for something the prompt never said.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, streamText, tool, type ModelMessage } from "ai";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { NutritionAnswer, NutritionFigures, RecipeFigures } from "@convex/functions/recipes/computeNutrition";
import { ASSISTANT_TOOLS } from "@shared/assistant";
import { convertQuantity, toGrams, weighableUnits, type RecipeUnit, type Unit } from "@shared/ingredients";
import { roundFacts, type IngredientFacts } from "@shared/nutrition";
import type { Locale } from "@shared/translations";

import { pool } from "../../../agent/__bench__/pool";
import { reportedCost, routing } from "../../../agent/__bench__/provider";
import type { Candidate, Effort, ProviderRouting } from "../../../agent/__bench__/types";
import { assistantAgent } from "../../../agent/agents";
import { assistantPrompt } from "../../../agent/config/prompts/assistant";
import { addToCellarTool, removeFromCellarTool } from "../../../agent/tools/cellar";
import { computeNutritionTool } from "../../../agent/tools/computeNutrition";
import { displayTool } from "../../../agent/tools/display";
import { planMealTool } from "../../../agent/tools/planMeal";
import { searchIngredientsTool } from "../../../agent/tools/searchIngredients";
import { searchRecipesTool } from "../../../agent/tools/searchRecipes";
import { showButtonTool } from "../../../agent/tools/showButton";
import { showSubstitutionsTool } from "../../../agent/tools/showSubstitutions";
import { appendBrief } from "../appendBrief";

/* ── The field ─────────────────────────────────────────────────────────────────────────── */

/**
 * The models under test, and the reasoning efforts to try each at. Edit this list — it is the knob
 * this file exists for. The first entry is the baseline: what `models.assistant` ships today, at
 * the effort `assistantAgent` asks for.
 */
const CANDIDATES: Candidate[] = [
  { name: "deepseek/deepseek-v4-flash-0731", modes: [false] }, // ships today
  // { name: "deepseek/deepseek-v4.1-flash", modes: [false] },
  // { name: "deepseek/deepseek-v4.1-flash", modes: ["low"] },
  // { name: "inclusionai/ling-3.0-flash-vl", modes: ["medium", "high"] },
  // { name: "deepseek/deepseek-v4-flash-0731", modes: ["low"] },
  // { name: "z-ai/glm-5.3-flash", modes: ["low", "high"] },
  // { name: "openai/gpt-6-luna", modes: [false, "low", "medium"] },
  // { name: "stealth/space-bunny-alpha", modes: ["low"] },
  // { name: "qwen/qwen3.8-omni-flash", modes: [false, "low"] },
  // { name: "xiaomi/mimo-v2.6-flash", modes: [false, "low"] },
  // { name: "nex-agi/nex-n2.5-pro", modes: [false, "medium"] },
];

/** Per case, per entrant. Two is enough to see a model that gets a case right only sometimes. */
const RUNS = 3;

/**
 * Turns in flight at once, across every entrant. A turn is mostly waiting on the network, so this
 * is what sets the wall-clock time. The jobs are interleaved across entrants, so at 24 each model
 * sees only a few concurrent turns; lower it if the table fills with 429s.
 */
const MAX_CONCURRENCY = 24;

/** One turn, every step included. A chat answer a shopper waits two minutes for is a failed one. */
const TIMEOUT_MS = 120_000;

/** The routing `models.assistant` ships with. */
const ROUTING: ProviderRouting = {
  sort: "price",
  ignore: ["open-inference", "morph", "digitalocean", "baidu"],
};

/** The agent's own cap, read rather than copied: a case cut by it is the production failure. */
const MAX_STEPS = assistantAgent.options.maxSteps ?? 7;

/* ── The catalog ───────────────────────────────────────────────────────────────────────── */

/**
 * A stable id that looks like a Convex one. Readable ids ("rcp_bolognaise") would let a model
 * treat them as names and write them in its answer, which is the exact leak `_invariants` checks.
 */
const _id = (key: string) => {
  const alphabet = "abcdefghjkmnpqrstvwxyz0123456789";
  // One FNV-1a hash per character, each over the whole key: a hash carried from character to
  // character collapses to a handful of ids once `% 32` has thrown most of it away.
  const _fnv = (text: string) => {
    let hash = 2166136261;
    for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return hash;
  };

  return "k57" + Array.from({ length: 29 }, (_, index) => alphabet[_fnv(`${index}:${key}`) % alphabet.length]).join("");
};

type Names = Record<Locale, string>;

type FakeIngredient = {
  name: Names;
  /** Other names the search answers to, in either language. */
  aliases?: string[];
  gramsPerPiece?: number;
  gramsPerMl?: number;
  per100g: IngredientFacts;
};

/**
 * Catalog order is search order. The three plant milks come first on purpose: a search for "lait"
 * returns only them, which is the trap `_SUBSTITUTIONS` in the prompt describes — the model has to
 * search again with the name the catalog uses ("lait demi-écrémé") to find plain milk.
 */
const INGREDIENTS = {
  almondMilk: { name: { fr: "lait d'amande", en: "almond milk" }, gramsPerMl: 1, per100g: { calories: 24, protein: 0.5, fat: 1.1, carbohydrates: 3 } },
  coconutMilk: { name: { fr: "lait de coco", en: "coconut milk" }, gramsPerMl: 1, per100g: { calories: 197, protein: 2, fat: 21, carbohydrates: 3 } },
  oatMilk: { name: { fr: "lait d'avoine", en: "oat milk" }, gramsPerMl: 1, per100g: { calories: 45, protein: 1, fat: 1.5, carbohydrates: 6.7 } },
  semiSkimmedMilk: { name: { fr: "lait demi-écrémé", en: "semi-skimmed milk" }, gramsPerMl: 1.03, per100g: { calories: 46, protein: 3.3, fat: 1.6, carbohydrates: 4.8 } },
  wholeMilk: { name: { fr: "lait entier", en: "whole milk" }, gramsPerMl: 1.03, per100g: { calories: 64, protein: 3.3, fat: 3.6, carbohydrates: 4.8 } },
  egg: { name: { fr: "oeuf", en: "egg" }, gramsPerPiece: 50, per100g: { calories: 143, protein: 12.6, fat: 9.5, carbohydrates: 0.7 } },
  cremeFraiche: { name: { fr: "crème fraîche", en: "crème fraîche" }, aliases: ["creme", "cream", "sour cream"], gramsPerMl: 1, per100g: { calories: 292, protein: 2.4, fat: 30, carbohydrates: 2.8 } },
  greekYogurt: { name: { fr: "yaourt grec", en: "greek yogurt" }, aliases: ["yogourt"], gramsPerMl: 1.05, per100g: { calories: 97, protein: 9, fat: 5, carbohydrates: 4 } },
  butter: { name: { fr: "beurre", en: "butter" }, per100g: { calories: 717, protein: 0.9, fat: 81, carbohydrates: 0.1 } },
  oliveOil: { name: { fr: "huile d'olive", en: "olive oil" }, gramsPerMl: 0.91, per100g: { calories: 884, protein: 0, fat: 100, carbohydrates: 0 } },
  sunflowerOil: { name: { fr: "huile de tournesol", en: "sunflower oil" }, gramsPerMl: 0.92, per100g: { calories: 884, protein: 0, fat: 100, carbohydrates: 0 } },
  margarine: { name: { fr: "margarine", en: "margarine" }, per100g: { calories: 717, protein: 0.2, fat: 80, carbohydrates: 0.7 } },
  applesauce: { name: { fr: "compote de pommes", en: "applesauce" }, aliases: ["apple sauce", "compote"], per100g: { calories: 68, protein: 0.3, fat: 0.2, carbohydrates: 16 } },
  parmesan: { name: { fr: "parmesan", en: "parmesan" }, aliases: ["parmigiano"], per100g: { calories: 392, protein: 35.8, fat: 25.8, carbohydrates: 3.2 } },
  pecorino: { name: { fr: "pecorino", en: "pecorino" }, per100g: { calories: 387, protein: 31.8, fat: 26.9, carbohydrates: 3.6 } },
  nutritionalYeast: { name: { fr: "levure maltée", en: "nutritional yeast" }, per100g: { calories: 325, protein: 50, fat: 5, carbohydrates: 36 } },
  groundBeef: { name: { fr: "boeuf haché", en: "ground beef" }, aliases: ["viande hachée", "minced beef", "boeuf", "beef"], per100g: { calories: 250, protein: 17, fat: 20, carbohydrates: 0 } },
  tomato: { name: { fr: "tomate", en: "tomato" }, gramsPerPiece: 120, per100g: { calories: 18, protein: 0.9, fat: 0.2, carbohydrates: 3.9 } },
  spaghetti: { name: { fr: "spaghetti", en: "spaghetti" }, aliases: ["pates", "pasta"], per100g: { calories: 359, protein: 12.5, fat: 1.5, carbohydrates: 71 } },
  apple: { name: { fr: "pomme", en: "apple" }, gramsPerPiece: 150, per100g: { calories: 52, protein: 0.3, fat: 0.2, carbohydrates: 13.8 } },
  chicken: { name: { fr: "cuisse de poulet", en: "chicken thigh" }, aliases: ["poulet", "chicken"], gramsPerPiece: 250, per100g: { calories: 165, protein: 31, fat: 3.6, carbohydrates: 0 } },
  redLentils: { name: { fr: "lentilles corail", en: "red lentils" }, aliases: ["lentilles", "lentils"], per100g: { calories: 358, protein: 24, fat: 2, carbohydrates: 60 } },
} satisfies Record<string, FakeIngredient>;

type IngredientKey = keyof typeof INGREDIENTS;

type FakeRecipe = {
  title: Names;
  /** Other words the search answers to: other spellings, and the ingredients. */
  keywords: string[];
  /** What one serving weighs and holds, or no nutrition at all — see `crumble`. */
  nutrition?: { servings: number; grams: number; perServing: IngredientFacts };
};

const RECIPES = {
  bolognaise: {
    title: { fr: "Spaghetti bolognaise", en: "Spaghetti bolognese" },
    keywords: ["bolognese", "bolognaise", "boeuf", "beef", "tomate", "tomato", "pates", "pasta"],
    nutrition: { servings: 4, grams: 420, perServing: { calories: 612, protein: 31, fat: 22, carbohydrates: 71 } },
  },
  chili: {
    title: { fr: "Chili con carne", en: "Chili con carne" },
    keywords: ["chili", "boeuf", "beef", "haricots rouges", "kidney beans", "tomate", "tomato"],
    nutrition: { servings: 4, grams: 380, perServing: { calories: 498, protein: 34, fat: 19, carbohydrates: 44 } },
  },
  meatballs: {
    title: { fr: "Boulettes de boeuf à la tomate", en: "Beef meatballs in tomato sauce" },
    keywords: ["boulettes", "meatballs", "boeuf", "beef", "tomate", "tomato"],
    nutrition: { servings: 4, grams: 350, perServing: { calories: 540, protein: 29, fat: 30, carbohydrates: 34 } },
  },
  basqueChicken: {
    title: { fr: "Poulet basquaise", en: "Basque chicken" },
    keywords: ["poulet", "chicken", "poivron", "pepper", "tomate", "tomato"],
    nutrition: { servings: 4, grams: 400, perServing: { calories: 386, protein: 38, fat: 18, carbohydrates: 14 } },
  },
  carbonara: {
    title: { fr: "Spaghetti carbonara", en: "Spaghetti carbonara" },
    keywords: ["carbonara", "pates", "pasta", "oeuf", "egg", "parmesan", "lardons", "bacon"],
    nutrition: { servings: 2, grams: 300, perServing: { calories: 689, protein: 27, fat: 32, carbohydrates: 70 } },
  },
  applePie: {
    title: { fr: "Tarte aux pommes", en: "Apple pie" },
    keywords: ["tarte", "pie", "pomme", "apple", "dessert"],
    nutrition: { servings: 8, grams: 120, perServing: { calories: 287, protein: 3, fat: 13, carbohydrates: 39 } },
  },
  // No nutrition: one of its ingredients cannot be weighed. The case asking about it checks the
  // model says so instead of estimating.
  crumble: {
    title: { fr: "Crumble aux pommes", en: "Apple crumble" },
    keywords: ["crumble", "pomme", "apple", "dessert"],
  },
  omelette: {
    title: { fr: "Omelette aux champignons", en: "Mushroom omelette" },
    keywords: ["omelette", "omelet", "oeuf", "egg", "champignon", "mushroom"],
    nutrition: { servings: 1, grams: 220, perServing: { calories: 318, protein: 22, fat: 24, carbohydrates: 3 } },
  },
  dal: {
    title: { fr: "Dal de lentilles corail", en: "Red lentil dal" },
    keywords: ["dal", "dahl", "curry", "lentilles", "lentils", "vegetarien", "vegetarian"],
    nutrition: { servings: 4, grams: 350, perServing: { calories: 402, protein: 19, fat: 12, carbohydrates: 52 } },
  },
  // Its keywords stop at the dish's own names, so it does not join the beef and pasta searches the
  // older cases were written against.
  lasagne: {
    title: { fr: "Lasagnes à la bolognaise", en: "Beef lasagna" },
    keywords: ["lasagne", "lasagnes", "lasagna"],
    nutrition: { servings: 6, grams: 400, perServing: { calories: 620, protein: 33, fat: 30, carbohydrates: 52 } },
  },
  pastaBake: {
    title: { fr: "Gratin de pâtes", en: "Pasta bake" },
    keywords: ["gratin", "bake", "pates", "pasta", "fromage", "cheese"],
    nutrition: { servings: 4, grams: 380, perServing: { calories: 575, protein: 26, fat: 24, carbohydrates: 63 } },
  },
} satisfies Record<string, FakeRecipe>;

type RecipeKey = keyof typeof RECIPES;

const I = Object.fromEntries(Object.keys(INGREDIENTS).map((key) => [key, _id(`i:${key}`)])) as Record<IngredientKey, string>;
const R = Object.fromEntries(Object.keys(RECIPES).map((key) => [key, _id(`r:${key}`)])) as Record<RecipeKey, string>;

const INGREDIENT_BY_ID = new Map(Object.entries(INGREDIENTS).map(([key, row]) => [I[key as IngredientKey], row as FakeIngredient]));
const RECIPE_BY_ID = new Map(Object.entries(RECIPES).map(([key, row]) => [R[key as RecipeKey], row as FakeRecipe]));

// Two rows on one id would score a model on a catalog that cannot exist: fail loudly, before any spend.
if (new Set([...Object.values(I), ...Object.values(R)]).size !== Object.keys(INGREDIENTS).length + Object.keys(RECIPES).length) {
  throw new Error("Two catalog rows share an id: fix `_id`.");
}

/* ── The fake search ───────────────────────────────────────────────────────────────────── */

const STOPWORDS = new Set(["a", "au", "aux", "de", "des", "du", "d", "l", "la", "le", "les", "et", "un", "une", "the", "of", "and", "with", "in"]);

/** Lowercase, unaccented, singular-ish words. "Pâtes" and "pates" and "pate" are one word. */
const _words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 ? word.replace(/[sx]$/, "") : word));

/**
 * Every word of the query must be somewhere in the row. Deliberately that strict: it is what makes
 * "qu'est-ce que je peux faire avec du boeuf" find nothing, as the prompt promises the model it
 * will, while "bolognaise" and "boeuf tomate" both find the bolognaise.
 */
const _matches = (query: string, haystack: string[]) => {
  const words = new Set(haystack.flatMap(_words));
  const wanted = _words(query);
  return wanted.length > 0 && wanted.every((word) => words.has(word));
};

/* ── The fake ctx ──────────────────────────────────────────────────────────────────────── */

type LineRequest = { ingredientId: string; quantity: number; unit: RecipeUnit };

const _scale = (facts: IngredientFacts, factor: number): IngredientFacts => ({
  calories: facts.calories * factor,
  protein: facts.protein * factor,
  fat: facts.fat * factor,
  carbohydrates: facts.carbohydrates * factor,
});

const _sum = (all: IngredientFacts[]): IngredientFacts =>
  all.reduce((sum, facts) => ({
    calories: sum.calories + facts.calories,
    protein: sum.protein + facts.protein,
    fat: sum.fat + facts.fat,
    carbohydrates: sum.carbohydrates + facts.carbohydrates,
  }), { calories: 0, protein: 0, fat: 0, carbohydrates: 0 });

const _figures = (total: IngredientFacts, grams: number, servings: number, lines: NutritionFigures["lines"]): NutritionFigures => ({
  servings,
  grams: Math.round(grams),
  total: roundFacts(total),
  perServing: roundFacts(_scale(total, 1 / servings)),
  per100g: roundFacts(_scale(total, 100 / grams)),
  lines,
});

/** `computeNutrition._internal`, over the fake catalog, with the app's own unit conversion. */
const _nutrition = (
  { recipeIds, lines, servings }: { recipeIds?: string[]; lines?: LineRequest[]; servings?: number },
  locale: Locale,
): NutritionAnswer => {
  if (recipeIds) {
    return {
      kind: "recipes",
      missing: recipeIds.filter((id) => !RECIPE_BY_ID.has(id)),
      recipes: recipeIds.flatMap((id): RecipeFigures[] => {
        const recipe = RECIPE_BY_ID.get(id);
        if (!recipe) return [];
        const title = recipe.title[locale];
        if (!recipe.nutrition) {
          return [{ id, title, unavailable: "This recipe has an ingredient that cannot be weighed, so it has no complete nutrition. Say so; do not estimate it." }];
        }
        const count = servings ?? recipe.nutrition.servings;
        return [{ id, title, ..._figures(_scale(recipe.nutrition.perServing, count), recipe.nutrition.grams * count, count, []) }];
      }),
    };
  }

  const requested = lines ?? [];
  const missing = requested.map((line) => line.ingredientId).filter((id) => !INGREDIENT_BY_ID.has(id));
  const weighed = requested.flatMap((line) => {
    const row = INGREDIENT_BY_ID.get(line.ingredientId);
    return row ? [{ line, row, grams: toGrams(line.quantity, line.unit, row) }] : [];
  });
  const unweighable = weighed
    .filter(({ grams }) => grams === undefined)
    .map(({ line, row }) => ({ ...line, name: row.name[locale], units: weighableUnits(row) }));

  if (missing.length || unweighable.length) return { kind: "lines", missing, unweighable };

  const shares = weighed.map(({ line, row, grams = 0 }) => ({ line, row, grams, facts: _scale(row.per100g, grams / 100) }));
  const grams = shares.reduce((sum, share) => sum + share.grams, 0);

  return {
    kind: "lines",
    missing,
    unweighable,
    figures: grams > 0
      ? _figures(_sum(shares.map((share) => share.facts)), grams, servings ?? 1, shares.map(({ line, row, grams: lineGrams, facts }) => ({
        name: row.name[locale],
        quantity: line.quantity,
        unit: line.unit,
        grams: Math.round(lineGrams),
        ...roundFacts(facts),
      })))
      : undefined,
  };
};

/** A cellar row's id, stable per ingredient: the fake cellar holds one row each. */
const _rowId = (ingredientId: string) => _id(`c:${ingredientId}`);

/**
 * `removeFromCellar._internal` over the case's cellar, with the app's own conversion and the same
 * two refusals: none of the food held is NOT_FOUND, held in a unit it cannot convert to is
 * INVALID_INPUT naming what is there. Each turn gets its own copy, so a removal never leaks into
 * the next case.
 */
const _removeFromStock = (stock: Stock[], { ingredientId, unit, quantity }: { ingredientId: string; unit: Unit; quantity: number }) => {
  const held = stock.filter((row) => I[row.ingredient] === ingredientId);
  if (held.length === 0) throw new ConvexError({ code: "NOT_FOUND", message: "No cellar row to remove." });

  const row = held.find((candidate) => candidate.unit === unit) ??
    held.find((candidate) => convertQuantity(quantity, unit, candidate.unit) !== undefined);

  if (!row) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: `No cellar row in ${unit} or a unit convertible to it. The cellar holds: ${held.map((candidate) => `${candidate.amount} ${candidate.unit}`).join(", ")}.`,
    });
  }

  const asked = row.unit === unit ? quantity : convertQuantity(quantity, unit, row.unit)!;
  const removed = Math.min(asked, row.amount);
  row.amount -= removed;

  return { cellarItemId: _rowId(ingredientId), unit: row.unit, removed };
};

/**
 * The only fake in the loop: `ctx.runQuery`, answering the five internal queries the assistant's
 * tools call, and `ctx.runMutation`, answering the two cellar writes against the case's stock.
 * Everything above and below them — each tool's `run`, its input dedupe, its thrown errors, its
 * output shape — is the app's code.
 */
const _fakeCtx = (locale: Locale, stock: Stock[], week: FakePlate[]) => ({
  runMutation: async (mutation: FunctionReference<"mutation", "internal">, args: Record<string, unknown>) => {
    const name = getFunctionName(mutation);

    switch (name) {
      // What planMeal reports back: the plate it wrote, and the planned one it took the slot of.
      case "router/planning/planOne:_internal": {
        const replaced = week.find((plate) => _dateOf(plate) === args.date && plate.slot === args.slot);
        return {
          mealPlanId: "k57testplan",
          plannedMealId: "k57testplate",
          ...(replaced && { replaced: { recipeId: R[replaced.recipe], servings: replaced.servings } }),
        };
      }

      // Nothing on the fake list, so an add strikes nothing.
      case "router/cellars/addToCellar:_internal":
        return { cellarItemId: _rowId(String(args.ingredientId)), struck: 0 };

      case "router/cellars/removeFromCellar:_internal":
        return _removeFromStock(stock, args as Parameters<typeof _removeFromStock>[1]);

      default:
        throw new Error(`The fake ctx does not serve ${name}. A tool started calling something new: add it here.`);
    }
  },
  runQuery: async (query: FunctionReference<"query", "internal">, args: Record<string, unknown>) => {
    const name = getFunctionName(query);

    switch (name) {
      case "router/recipes/search:_internal":
        return [...RECIPE_BY_ID]
          .filter(([, recipe]) => _matches(String(args.query), [recipe.title.fr, recipe.title.en, ...recipe.keywords]))
          .slice(0, Number(args.limit))
          .map(([id, recipe]) => ({ id, title: recipe.title[locale] }));

      case "router/ingredients/search:_internal":
        return [...INGREDIENT_BY_ID]
          .filter(([, row]) => _matches(String(args.query), [row.name.fr, row.name.en]) || (row.aliases ?? []).some((alias) => _matches(String(args.query), [alias])))
          .slice(0, Number(args.limit))
          .map(([id, row]) => ({ _id: id, name: row.name[locale], gramsPerPiece: row.gramsPerPiece, gramsPerMl: row.gramsPerMl, nutrition: row.per100g }));

      case "router/recipes/missingIds:_internal":
        return (args.ids as string[]).filter((id) => !RECIPE_BY_ID.has(id));

      case "router/ingredients/missingIds:_internal":
        return (args.ids as string[]).filter((id) => !INGREDIENT_BY_ID.has(id));

      case "router/recipes/computeNutrition:_internal":
        return _nutrition(args as Parameters<typeof _nutrition>[0], locale);

      case "router/planning/getMany:_internal":
        return week
          .filter((plate) => _dateOf(plate) >= Number(args.from) && _dateOf(plate) < Number(args.to))
          .map((plate) => ({
            date: _dateOf(plate),
            slot: plate.slot,
            servings: plate.servings,
            status: "ready",
            recipe: { id: R[plate.recipe], title: RECIPES[plate.recipe].title[locale] },
          }));

      default:
        throw new Error(`The fake ctx does not serve ${name}. A tool started calling something new: add it here.`);
    }
  },
});

/**
 * The tool set `answerTurn` registers, keyed the same way, each running its real `run` against the
 * fake ctx. Rebuilding with `tool()` rather than passing the Convex tools through is what lets the
 * ctx in: theirs reads it off `this`, which only the agent sets.
 */
const _tools = (locale: Locale, stock: Stock[], week: FakePlate[]) => {
  // A copy: the fake removal spends it, and the case's own stock is read again by the next run.
  const ctx = _fakeCtx(locale, stock.map((row) => ({ ...row })), week) as never;
  const userId = "k57testuser" as Id<"users">;
  const householdId = "k57testhousehold" as Id<"households">;
  const real = {
    [ASSISTANT_TOOLS.searchRecipes]: searchRecipesTool({ userId, locale }),
    [ASSISTANT_TOOLS.searchIngredients]: searchIngredientsTool({ locale }),
    [ASSISTANT_TOOLS.computeNutrition]: computeNutritionTool({ locale }),
    [ASSISTANT_TOOLS.display]: displayTool,
    [ASSISTANT_TOOLS.showButton]: showButtonTool,
    [ASSISTANT_TOOLS.showSubstitutions]: showSubstitutionsTool,
    [ASSISTANT_TOOLS.addToCellar]: addToCellarTool({ householdId }),
    [ASSISTANT_TOOLS.removeFromCellar]: removeFromCellarTool({ householdId }),
    [ASSISTANT_TOOLS.planMeal]: planMealTool({ householdId, locale, today: TODAY_MS, now: `${TODAY}T19:05` }),
  };

  return Object.fromEntries(
    Object.entries(real).map(([name, convexTool]) => [
      name,
      tool({
        description: convexTool.description,
        inputSchema: convexTool.inputSchema,
        execute: (input: unknown) => convexTool.run(ctx, input as never),
      }),
    ]),
  );
};

/* ── The brief ─────────────────────────────────────────────────────────────────────────── */

const TODAY = "2026-09-29";
const NOW = `Tuesday ${TODAY} 19:05`;
/** The cook's local midnight, as the phone sends it. The bench's cook lives on UTC. */
const TODAY_MS = Date.parse(`${TODAY}T00:00:00Z`);

/** A plate already on the case's week, `days` after today. */
type FakePlate = { recipe: RecipeKey; days: number; slot: "lunch" | "dinner"; servings: number };

const _dateOf = (plate: FakePlate) => TODAY_MS + plate.days * 86_400_000;

/** The calendar date `days` after today, as the model passes it to planMeal. */
const _day = (days: number) => new Date(TODAY_MS + days * 86_400_000).toISOString().slice(0, 10);

type Stock = { ingredient: IngredientKey; amount: number; unit: "g" | "ml" | "pcs"; expiresIn?: number };

/** `turnBrief`'s text, line for line, from a hand-written cellar — and recipe, when cooking one. */
const _brief = (stock: Stock[], locale: Locale, recipe?: string) => {
  const _when = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
  const _date = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  const cellar = stock.length
    ? stock
      .map(({ ingredient, amount, unit, expiresIn }) =>
        `- ${INGREDIENTS[ingredient].name[locale]} (id: ${I[ingredient]}): ${amount} ${unit}` +
        (expiresIn === undefined ? "" : `, expires ${_date(expiresIn)} (${_when(expiresIn)})`))
      .join("\n")
    : "empty";

  return `${recipe ?? "<recipe>none</recipe>"}\n<cellar>\n${cellar}\n</cellar>\n<now>${NOW}</now>`;
};

/* ── The trace ─────────────────────────────────────────────────────────────────────────── */

/** One tool call as the model made it, and what came back. */
type Call = { tool: string; input: Record<string, unknown>; output?: unknown; error?: string };

type Turn = { calls: Call[]; text: string; finish: string };

const _calls = (turn: Turn, name: string) => turn.calls.filter((call) => call.tool === name);
const _succeeded = (turn: Turn, name: string) => _calls(turn, name).filter((call) => call.error === undefined);

/** Every recipe id a successful display showed. */
const _displayed = (turn: Turn) => _succeeded(turn, ASSISTANT_TOOLS.display).flatMap((call) => (call.input.ids as string[]) ?? []);

/** Every swap a successful showSubstitutions showed. */
const _swaps = (turn: Turn) =>
  _succeeded(turn, ASSISTANT_TOOLS.showSubstitutions).flatMap((call) => (call.input.swaps as { from: string; to: string }[]) ?? []);

const _queries = (turn: Turn, name: string) => _calls(turn, name).flatMap((call) => (call.input.queries as string[]) ?? []);

type CellarItemRequest = { ingredientId: string; quantity: number; unit: Unit };

/** The lines one cellar call asked for. */
const _items = (call: Call) => (call.input.items as CellarItemRequest[] | undefined) ?? [];

/** Every line a cellar tool was asked for, across the turn, successful calls only. */
const _cellarItems = (turn: Turn, name: string) => _succeeded(turn, name).flatMap(_items);

/** A cellar tool was asked for this ingredient, in one of these units, in this quantity. */
const _asked = (turn: Turn, name: string, ingredient: IngredientKey, quantity: number, units: Unit[]) =>
  _cellarItems(turn, name).some((item) => item.ingredientId === I[ingredient] && item.quantity === quantity && units.includes(item.unit)) ||
  `${name} was not asked for ${quantity} ${units.join("/")} of ${ingredient} (got: ${JSON.stringify(_cellarItems(turn, name).map((item) => ({ ...item, ingredientId: _nameOf(item.ingredientId) })))})`;

/**
 * The answer puts a question to the cook: what an offer, or a clarification, reads as. A question
 * mark, or the imperative a cook reads as one ("dis-moi combien…", "tell me how many…").
 */
const _asks = (turn: Turn, what: string) =>
  turn.text.includes("?") || /\b(dis-moi|dites-moi|tell me)\b/i.test(turn.text) || `the answer does not ask ${what}`;

/** planMeal was called for this recipe, day, meal and head count, and planned it (not `occupied`). */
const _planned = (turn: Turn, recipe: RecipeKey, days: number, slot: "lunch" | "dinner", servings: number) => {
  const calls = _succeeded(turn, ASSISTANT_TOOLS.planMeal);
  const landed = calls.some((call) =>
    call.input.recipeId === R[recipe] && call.input.date === _day(days) && call.input.slot === slot &&
    call.input.servings === servings && (call.output as { status?: string } | undefined)?.status === "planned");

  return landed ||
    `planMeal did not plan ${recipe} on ${_day(days)} ${slot} for ${servings} (got: ${JSON.stringify(calls.map((call) => ({ ...call.input, recipeId: _nameOf(String(call.input.recipeId)) })))})`;
};

const _nameOf = (id: string) => {
  const ingredient = INGREDIENT_BY_ID.get(id);
  const recipe = RECIPE_BY_ID.get(id);
  return ingredient?.name.en ?? recipe?.title.en ?? `unknown ${id}`;
};

/* ── What every turn must get right ────────────────────────────────────────────────────── */

const ALL_IDS = [...INGREDIENT_BY_ID.keys(), ...RECIPE_BY_ID.keys()];

/**
 * The rules of `assistantPrompt` that hold whatever was asked. Each message names the rule and the
 * value that broke it, so the table can be read without the transcript.
 */
const _invariants = (turn: Turn, stock: Stock[]): string[] => {
  const failures: string[] = [];

  if (!turn.text.trim()) failures.push(`the turn ended with no answer (finish: ${turn.finish})`);

  // "Ids go to display and computeNutrition and nowhere else. Never write one in your answer."
  for (const id of ALL_IDS.filter((id) => turn.text.includes(id))) failures.push(`the answer shows the id of ${_nameOf(id)}`);

  // "Never use an em dash or an en dash, in any language."
  if (/[—–]/.test(turn.text)) failures.push("the answer uses an em or en dash");

  // A failed call is a step spent and a retry the cook waits for, even when the retry lands.
  for (const call of turn.calls) {
    if (call.error !== undefined) failures.push(`${call.tool} failed: ${call.error.slice(0, 140)}`);
  }

  // ADR 0010: the model carries ids a search handed it, it never composes one. Walked in order,
  // so an id used before the search that returns it is caught too. Cellar ids are in the brief.
  const seen = new Set(stock.map(({ ingredient }) => I[ingredient]));
  for (const call of turn.calls) {
    const carried =
      call.tool === ASSISTANT_TOOLS.display ? ((call.input.ids as string[]) ?? [])
        : call.tool === ASSISTANT_TOOLS.showSubstitutions ? ((call.input.swaps as { from: string; to: string }[]) ?? []).flatMap(({ from, to }) => [from, to])
          : call.tool === ASSISTANT_TOOLS.computeNutrition ? [...((call.input.recipeIds as string[]) ?? []), ...((call.input.lines as LineRequest[]) ?? []).map((line) => line.ingredientId)]
            : call.tool === ASSISTANT_TOOLS.addToCellar || call.tool === ASSISTANT_TOOLS.removeFromCellar ? _items(call).map((item) => item.ingredientId)
              : call.tool === ASSISTANT_TOOLS.planMeal ? [String(call.input.recipeId ?? "")]
                : [];
    // An empty id is a stand-in for a field left out, which `createTool` drops (`parseToolInput`).
    for (const id of carried.filter((id) => id.trim() !== "" && !seen.has(id))) failures.push(`${call.tool} was given an id no search returned: ${id}`);

    if (call.tool === ASSISTANT_TOOLS.searchRecipes || call.tool === ASSISTANT_TOOLS.searchIngredients) {
      const found = (call.output as { recipes?: { id: string }[]; ingredients?: { id: string }[] }[] | undefined) ?? [];
      for (const row of found.flatMap((entry) => [...(entry.recipes ?? []), ...(entry.ingredients ?? [])])) seen.add(row.id);
    }
  }

  // "Call it once per answer." / "At most one button." / "It points somewhere else, so it comes last."
  if (_succeeded(turn, ASSISTANT_TOOLS.display).length > 1) failures.push("display was called more than once");
  const buttons = _calls(turn, ASSISTANT_TOOLS.showButton);
  if (buttons.length > 1) failures.push("showButton was called more than once");
  if (buttons.length && turn.calls[turn.calls.length - 1]?.tool !== ASSISTANT_TOOLS.showButton) failures.push("showButton was not the last call");

  return failures;
};

/* ── The cases ─────────────────────────────────────────────────────────────────────────── */

type Case = {
  name: string;
  locale: Locale;
  stock: Stock[];
  /** Earlier exchanges in the thread, as plain text. Only the question takes the brief. */
  history?: ModelMessage[];
  /** Plates already planned, which planMeal finds on the slot it is asked for. */
  week?: FakePlate[];
  /** The `<recipe>` block `recipeBrief` writes, when the question is asked from the cooking screen. */
  recipe?: string;
  question: string;
  /** What this question must produce, beyond `_invariants`: `true` for a hit, a message for a miss. */
  expect: (turn: Turn) => (string | true)[];
};

const _must = (turn: Turn, name: string) => _calls(turn, name).length > 0 || `${name} was never called`;
const _mustNot = (turn: Turn, name: string) => _calls(turn, name).length === 0 || `${name} was called and should not have been`;
const _showsAnyOf = (turn: Turn, keys: RecipeKey[]) =>
  _displayed(turn).some((id) => keys.some((key) => R[key] === id)) ||
  `display showed none of ${keys.join(", ")} (showed: ${_displayed(turn).map(_nameOf).join(", ") || "nothing"})`;

/** The figure appears as a whole number in the answer, thousands separators ignored. */
const _says = (turn: Turn, figure: number, what: string) =>
  new RegExp(`(^|[^\\d])${figure}([^\\d]|$)`).test(turn.text.replace(/(\d)[\s  ,.](?=\d{3}\b)/g, "$1")) ||
  `the answer does not quote ${what} (${figure}) as the tool returned it`;

const BEEF_NIGHT: Stock[] = [
  { ingredient: "groundBeef", amount: 500, unit: "g", expiresIn: 1 },
  { ingredient: "tomato", amount: 6, unit: "pcs", expiresIn: 4 },
  { ingredient: "spaghetti", amount: 500, unit: "g" },
];

/** A gratin written for 4, cooked for 6: the ingredients are scaled, the steps keep the written 60 cl. */
const GRATIN_FOR_SIX = [
  "<recipe>",
  "name: Gratin dauphinois",
  "written for: 4",
  "cooking for: 6",
  "scaled ingredients:",
  "- 1500 g pomme de terre",
  "- 90 cl crème liquide",
  "- 2 pcs gousse d'ail",
  "not-scaled steps:",
  "1. Éplucher les pommes de terre et les couper en rondelles fines.",
  "2. Frotter le plat avec l'ail.",
  "3. Verser 60 cl de crème sur les pommes de terre.",
  "4. Enfourner 1 h à 160 °C.",
  "current step: 3",
  "</recipe>",
].join("\n");

const CASES: Case[] = [
  /* Cooking: a question from the stove is about the recipe on screen, at the servings cooked. */
  {
    // "Questions like 'how much salt?' … are about this recipe and this step."
    // "When you give an amount, take it from the scaled ingredients, never from a step."
    name: "fr · cooking, amount for this step",
    locale: "fr",
    stock: [],
    recipe: GRATIN_FOR_SIX,
    question: "J'en mets combien ?",
    expect: (turn) => [
      _says(turn, 90, "the cream scaled to 6"),
      !/(^|[^\d])60\s*cl/.test(turn.text) || "quoted the step's written 60 cl rather than the scaled amount",
      _mustNot(turn, ASSISTANT_TOOLS.searchRecipes),
    ],
  },

  {
    // "\"none\" means they are not cooking from a recipe right now, even if an earlier message was about one."
    // The bug: asked from the gratin, then from home in the same thread, it was still cooking the gratin.
    name: "fr · left the recipe, history does not cook",
    locale: "fr",
    stock: [],
    history: [
      { role: "user", content: "J'en mets combien ?" },
      { role: "assistant", content: "Pour ton gratin à 6, verse 90 cl de crème sur les pommes de terre." },
    ],
    question: "Combien de temps ça cuit ?",
    expect: (turn) => [
      !/gratin/i.test(turn.text) || "answered for the gratin, which the cook is no longer cooking",
      _asks(turn, "which dish they mean"),
    ],
  },

  /* Recipes: search the dish, then choose and display. */
  {
    name: "fr · dinner from the cellar",
    locale: "fr",
    stock: BEEF_NIGHT,
    question: "Qu'est-ce que je peux faire ce soir ?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.searchRecipes),
      // "Search for the DISH, not for the question."
      ..._queries(turn, ASSISTANT_TOOLS.searchRecipes)
        .filter((query) => query.trim().split(/\s+/).length > 4)
        .map((query) => `searched the question, not a dish: "${query}"`),
      _showsAnyOf(turn, ["bolognaise", "chili", "meatballs"]),
      _mustNot(turn, ASSISTANT_TOOLS.showButton),
    ],
  },
  {
    name: "en · ingredients named, no cellar",
    locale: "en",
    stock: [],
    question: "What can I cook with beef and tomatoes?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.searchRecipes),
      _showsAnyOf(turn, ["bolognaise", "chili", "meatballs"]),
    ],
  },
  {
    // "When the cellar is empty ... still search and show recipes that fit what they asked."
    name: "en · empty cellar still gets recipes",
    locale: "en",
    stock: [],
    question: "Any idea for dinner tonight?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.searchRecipes),
      _displayed(turn).length > 0 || "display showed nothing to a cook with an empty cellar",
    ],
  },
  {
    name: "fr · dessert from the apples",
    locale: "fr",
    stock: [{ ingredient: "apple", amount: 6, unit: "pcs", expiresIn: 3 }, { ingredient: "butter", amount: 250, unit: "g" }],
    question: "Une idée de dessert avec mes pommes ?",
    expect: (turn) => [_showsAnyOf(turn, ["applePie", "crumble"])],
  },
  {
    // "If the catalog has nothing that is what they asked for, say so plainly first, then show the
    // closest recipes you found." The miss is checked by the dish's name being in the answer.
    name: "fr · missing dish shows the closest",
    locale: "fr",
    stock: BEEF_NIGHT,
    question: "Tu as une recette de ramen au kimchi ?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.searchRecipes),
      _calls(turn, ASSISTANT_TOOLS.searchRecipes).length <= 2 || "searched more than twice for a dish the catalog does not have",
      _displayed(turn).length > 0 || "display showed nothing: the closest recipes were not offered",
      /ramen/i.test(turn.text) || "the answer never says the ramen was not found",
    ],
  },

  /* The button. */
  {
    name: "en · plan my week",
    locale: "en",
    stock: BEEF_NIGHT,
    question: "Can you plan my dinners for the week?",
    expect: (turn) => {
      const button = _calls(turn, ASSISTANT_TOOLS.showButton)[0]?.input;
      return [
        _must(turn, ASSISTANT_TOOLS.display),
        _must(turn, ASSISTANT_TOOLS.showButton),
        !button || button.destination === "planning" || `showButton went to "${String(button.destination)}", not planning`,
        !button || button.variant === "primary" || `showButton was "${String(button.variant)}", not primary`,
      ];
    },
  },
  {
    name: "en · where is my shopping list",
    locale: "en",
    stock: [],
    question: "Where do I find my shopping list?",
    expect: (turn) => {
      const button = _calls(turn, ASSISTANT_TOOLS.showButton)[0]?.input;
      return [
        _must(turn, ASSISTANT_TOOLS.showButton),
        !button || button.destination === "groceries" || `showButton went to "${String(button.destination)}", not groceries`,
        _mustNot(turn, ASSISTANT_TOOLS.display),
      ];
    },
  },

  /* Substitutions: search both sides in one call, then show the pairs. */
  {
    name: "fr · the swap they named",
    locale: "fr",
    stock: [],
    question: "Je peux remplacer la crème fraîche par du yaourt grec dans ma sauce ?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.showSubstitutions),
      _swaps(turn).some(({ from, to }) => from === I.cremeFraiche && to === I.greekYogurt) ||
      "no swap from crème fraîche to greek yogurt",
      // "Search every ingredient on both sides in ONE searchIngredients call."
      _calls(turn, ASSISTANT_TOOLS.searchIngredients).some((call) => {
        const found = ((call.output as { ingredients: { id: string }[] }[] | undefined) ?? [])
          .flatMap((entry) => entry.ingredients.map((ingredient) => ingredient.id));
        return found.includes(I.cremeFraiche) && found.includes(I.greekYogurt);
      }) || "the two sides were not found by one searchIngredients call",
    ],
  },
  {
    name: "en · alternatives to one ingredient",
    locale: "en",
    stock: [],
    question: "What can I use instead of butter in a cake?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.showSubstitutions),
      _swaps(turn).length >= 2 || `only ${_swaps(turn).length} alternative shown`,
      ..._swaps(turn).filter(({ from }) => from !== I.butter).map(({ from }) => `a swap starts from ${_nameOf(from)}, not butter`),
    ],
  },
  {
    // The catalog trap `_SUBSTITUTIONS` describes: "lait" finds only plant milks here.
    name: "fr · plain milk needs the catalog's name",
    locale: "fr",
    stock: [],
    question: "Par quoi je peux remplacer le lait dans une pâte à crêpes ?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.showSubstitutions),
      ..._swaps(turn)
        .filter(({ from }) => from !== I.semiSkimmedMilk && from !== I.wholeMilk)
        .map(({ from }) => `a swap starts from ${_nameOf(from)}, not plain milk`),
    ],
  },
  {
    name: "fr · a follow-up keeps the context",
    locale: "fr",
    stock: [],
    history: [
      { role: "user", content: "Je fais une carbonara ce soir, un conseil ?" },
      { role: "assistant", content: "Mélange les jaunes et le parmesan hors du feu, puis ajoute un peu d'eau de cuisson des pâtes : la sauce reste crémeuse sans cuire les oeufs." },
    ],
    question: "J'ai plus de parmesan, je mets quoi ?",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.showSubstitutions),
      (_swaps(turn).length > 0 && _swaps(turn).every(({ from }) => from === I.parmesan)) ||
      `swaps do not all start from parmesan (${_swaps(turn).map(({ from }) => _nameOf(from)).join(", ") || "none"})`,
    ],
  },

  /* Nutrition: every figure through computeNutrition, copied as it came back. */
  {
    name: "fr · calories in two eggs",
    locale: "fr",
    stock: [],
    question: "Combien de calories dans deux oeufs ?",
    expect: (turn) => {
      const lines = _calls(turn, ASSISTANT_TOOLS.computeNutrition).flatMap((call) => (call.input.lines as LineRequest[]) ?? []);
      // 2 eggs × 50 g × 143 kcal / 100 g: what the fake computes, the way the app computes it.
      const total = Math.round((143 * 2 * 50) / 100);
      return [
        _must(turn, ASSISTANT_TOOLS.computeNutrition),
        // "'one egg' is 1 in pcs."
        lines.some((line) => line.ingredientId === I.egg && line.unit === "pcs" && line.quantity === 2) ||
        `no line of 2 pcs of egg (got: ${JSON.stringify(lines)})`,
        _says(turn, total, "the total calories"),
      ];
    },
  },
  {
    name: "en · protein per serving of a recipe",
    locale: "en",
    stock: [],
    question: "How much protein is in one serving of chili con carne?",
    expect: (turn) => {
      const calls = _calls(turn, ASSISTANT_TOOLS.computeNutrition);
      return [
        calls.some((call) => (call.input.recipeIds as string[] | undefined)?.includes(R.chili)) || "computeNutrition never got the chili's id",
        // "For a recipe, pass its id; do not rebuild it from ingredients."
        calls.every((call) => !call.input.lines) || "the recipe was rebuilt from ingredient lines",
        _says(turn, RECIPES.chili.nutrition.perServing.protein, "the protein per serving"),
      ];
    },
  },
  {
    name: "fr · two recipes compared in one call",
    locale: "fr",
    stock: [],
    question: "Compare les calories par portion de la bolognaise et du chili con carne.",
    expect: (turn) => {
      const calls = _calls(turn, ASSISTANT_TOOLS.computeNutrition);
      return [
        // "Several recipes or ingredients go in one call, not one call each."
        calls.some((call) => {
          const ids = (call.input.recipeIds as string[] | undefined) ?? [];
          return ids.includes(R.bolognaise) && ids.includes(R.chili);
        }) || `the two recipes were not in one computeNutrition call (${calls.length} calls)`,
        _says(turn, RECIPES.bolognaise.nutrition.perServing.calories, "the bolognaise's calories"),
        _says(turn, RECIPES.chili.nutrition.perServing.calories, "the chili's calories"),
      ];
    },
  },
  {
    // "If computeNutrition says a recipe has no complete nutrition, say so. Do not estimate it."
    name: "fr · no nutrition is not an estimate",
    locale: "fr",
    stock: [],
    question: "Combien de calories dans une part de crumble aux pommes ?",
    expect: (turn) => [
      _calls(turn, ASSISTANT_TOOLS.computeNutrition).some((call) => (call.input.recipeIds as string[] | undefined)?.includes(R.crumble)) ||
      "computeNutrition never got the crumble's id",
      !/\d{2,}\s*(k?cal|calories)/i.test(turn.text) || "the answer gives a calorie figure the tool said it could not compute",
    ],
  },

  /* The cellar: act on an order, offer on a story, ask when the place is unclear. */
  {
    name: "fr · an order to remove acts",
    locale: "fr",
    stock: BEEF_NIGHT,
    question: "Retire 200 g de spaghetti et 2 tomates de mon cellier.",
    expect: (turn) => [
      _asked(turn, ASSISTANT_TOOLS.removeFromCellar, "spaghetti", 200, ["g"]),
      _asked(turn, ASSISTANT_TOOLS.removeFromCellar, "tomato", 2, ["pcs"]),
      _mustNot(turn, ASSISTANT_TOOLS.addToCellar),
    ],
  },
  {
    name: "en · an order to add acts",
    locale: "en",
    stock: [],
    question: "Add 6 eggs and 500 g of spaghetti to my cellar.",
    expect: (turn) => [
      _asked(turn, ASSISTANT_TOOLS.addToCellar, "egg", 6, ["pcs"]),
      _asked(turn, ASSISTANT_TOOLS.addToCellar, "spaghetti", 500, ["g"]),
      _mustNot(turn, ASSISTANT_TOOLS.removeFromCellar),
    ],
  },
  {
    // "When they only tell you what they did, offer and wait for their yes." Pesto is not in the
    // catalog on purpose: the offer is about the pasta whatever the rest of the sentence holds.
    name: "fr · a cooked dish is offered, not removed",
    locale: "fr",
    stock: BEEF_NIGHT,
    question: "Je viens de cuisiner 500 g de pâtes avec 200 g de pesto.",
    expect: (turn) => [
      _mustNot(turn, ASSISTANT_TOOLS.removeFromCellar),
      _mustNot(turn, ASSISTANT_TOOLS.addToCellar),
      _asks(turn, "whether to take the pasta out of the cellar"),
    ],
  },
  {
    name: "fr · the yes after the offer removes",
    locale: "fr",
    stock: BEEF_NIGHT,
    history: [
      { role: "user", content: "Je viens de cuisiner 500 g de pâtes avec 200 g de pesto." },
      { role: "assistant", content: "Bon appétit ! Je retire les 500 g de spaghetti de ton cellier ?" },
    ],
    question: "Oui vas-y",
    expect: (turn) => [
      _asked(turn, ASSISTANT_TOOLS.removeFromCellar, "spaghetti", 500, ["g"]),
      _mustNot(turn, ASSISTANT_TOOLS.addToCellar),
    ],
  },
  {
    // "'Ajoute des tomates' alone could mean their cellar or their shopping list, so ask which."
    name: "fr · add with no place asks where",
    locale: "fr",
    stock: [],
    question: "Ajoute 3 tomates",
    expect: (turn) => [
      _mustNot(turn, ASSISTANT_TOOLS.addToCellar),
      _mustNot(turn, ASSISTANT_TOOLS.removeFromCellar),
      _asks(turn, "whether the tomatoes go in the cellar or on the list"),
    ],
  },
  {
    // Food the cellar did not hold is `absent`: normal, never an apology.
    name: "fr · removing what the cellar lacks is no error",
    locale: "fr",
    stock: [],
    question: "Retire 2 tomates de mon cellier.",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.removeFromCellar),
      !/d[ée]sol[ée]|pardon|excuse|erreur/i.test(turn.text) || "the answer apologises for food the cellar did not hold",
    ],
  },
  {
    // "For a unit the cellar does not hold, ask how much that is; never convert between grams and
    // pieces yourself." A removal in pieces within the same turn is that conversion. The tool call
    // is NOT required: the brief already says the tomatoes are in pieces, and a model that reads it
    // and asks straight away has done better than one that tries and fails first (run 2026-09-30,
    // 3 of 3 asked without calling).
    name: "fr · grams against pieces asks, never converts",
    locale: "fr",
    stock: [{ ingredient: "tomato", amount: 6, unit: "pcs" }],
    question: "Retire 500 g de tomates de mon cellier.",
    expect: (turn) => [
      _cellarItems(turn, ASSISTANT_TOOLS.removeFromCellar).every((item) => item.unit !== "pcs") ||
      "the model converted the grams to pieces itself and removed them",
      _asks(turn, "how many tomatoes that is"),
    ],
  },

  /* Planning one plate: a wish is an offer, an order with everything in it is done, a week is the planner's. */
  {
    // "The invitation that ends your answer is your one question: it offers to plan it and asks for
    // everything still missing at once." Nothing is planned before the cook answers it.
    name: "fr · a dish for tonight is shown with an offer to plan it",
    locale: "fr",
    stock: [],
    question: "Je veux faire des lasagnes ce soir",
    expect: (turn) => [
      _showsAnyOf(turn, ["lasagne"]),
      _mustNot(turn, ASSISTANT_TOOLS.planMeal),
      /combien|personnes/i.test(turn.text) || "the answer does not ask how many they will be",
      /planifi/i.test(turn.text) || "the answer does not offer to plan it",
      /liste|courses/i.test(turn.text) || "the offer does not say the shopping list will be updated",
    ],
  },
  {
    // "Ask for everything still missing in ONE short question, never one after the other." A cook
    // asked the head count, then the meal, answers twice for one plate.
    name: "fr · a day with no meal and no count asks both at once",
    locale: "fr",
    stock: [],
    question: "Je veux faire des lasagnes vendredi",
    expect: (turn) => [
      _mustNot(turn, ASSISTANT_TOOLS.planMeal),
      /combien|personnes/i.test(turn.text) || "the answer does not ask how many they will be",
      /midi|soir|déjeuner|dîner/i.test(turn.text) || "the answer does not ask lunch or dinner",
    ],
  },
  {
    // "When they answer that offer with what was missing, that is their yes: plan it at once,
    // without asking again."
    name: "fr · answering the offer with the head count plans it",
    locale: "fr",
    stock: [],
    history: [
      { role: "user", content: "Je veux faire des lasagnes ce soir" },
      {
        role: "assistant",
        content: "Voici des lasagnes à la bolognaise. Touche la recette pour la voir, ou dis-moi pour combien, " +
          "je la planifie pour ce soir et je mets à jour ta liste de courses.",
      },
    ],
    question: "On sera 4",
    expect: (turn) => [_planned(turn, "lasagne", 0, "dinner", 4)],
  },
  {
    // "When they ask you to plan it and already said the dish, the day and how many, plan it at once."
    name: "fr · an order with everything in it plans at once",
    locale: "fr",
    stock: [],
    question: "Mets des lasagnes pour 4 ce soir au menu",
    expect: (turn) => [_planned(turn, "lasagne", 0, "dinner", 4)],
  },
  {
    // "Tonight is dinner, noon is lunch." Thursday is two days after the bench's Tuesday.
    name: "fr · a weekday and noon land on the right plate",
    locale: "fr",
    stock: [],
    question: "Planifie un dal jeudi midi pour 2",
    expect: (turn) => [_planned(turn, "dal", 2, "lunch", 2)],
  },
  {
    // Seen on device: the recipe was shown as a card, and the card's "whenever you showed recipes"
    // invitation won over "plan it at once". An order draws the planned meal, never a recipe card.
    name: "fr · an order for tomorrow night plans without a card or an offer",
    locale: "fr",
    stock: [],
    question: "Planifie des lasagnes pour demain soir pour 2 personnes",
    expect: (turn) => [
      _planned(turn, "lasagne", 1, "dinner", 2),
      _mustNot(turn, ASSISTANT_TOOLS.display),
      !/touche|dis-moi/i.test(turn.text) || "the answer still invites them to open or plan the recipe",
    ],
  },
  {
    // "When planMeal answers occupied ... say which dish is already there and ask."
    name: "fr · a taken slot is named and asked about, not replaced",
    locale: "fr",
    stock: [],
    week: [{ recipe: "chili", days: 0, slot: "dinner", servings: 4 }],
    question: "Mets des lasagnes pour 4 ce soir au menu",
    expect: (turn) => [
      _must(turn, ASSISTANT_TOOLS.planMeal),
      _calls(turn, ASSISTANT_TOOLS.planMeal).every((call) => call.input.replace !== true) ||
      "planMeal replaced the chili without asking",
      /chili/i.test(turn.text) || "the answer does not name the chili already planned",
      _asks(turn, "whether to replace it"),
    ],
  },
  {
    // Seen on device: "je ne peux pas écrire dans ta liste", and an offer. "An order to put what a
    // dish needs on their shopping list is an order to plan it", and "moi et ma copine" is 2.
    name: "fr · a dish for the shopping list is planned, the count said in words",
    locale: "fr",
    stock: [],
    question: "Rajoute moi dans ma liste de courses de quoi faire des lasagnes pour moi et ma copine pour demain soir",
    expect: (turn) => [
      _planned(turn, "lasagne", 1, "dinner", 2),
      _mustNot(turn, ASSISTANT_TOOLS.display),
    ],
  },
  {
    // Seen on device: the count said a turn earlier was asked again, and the card shown again.
    // "How many they will be counts however they said it, in this message or earlier."
    name: "fr · a count said earlier in the conversation plans on the yes",
    locale: "fr",
    stock: [],
    history: [
      { role: "user", content: "Je vois ma copine ce weekend, elle est fan de pâtes, tu as une recette ?" },
      {
        role: "assistant",
        content: "Des spaghetti à la carbonara, ça devrait lui plaire. Touche la recette pour la voir, ou " +
          "dis-moi quel jour et quel repas, je la planifie et je mets à jour ta liste de courses.",
      },
    ],
    question: "Vas-y, on la mange demain soir",
    expect: (turn) => [
      _planned(turn, "carbonara", 1, "dinner", 2),
      _mustNot(turn, ASSISTANT_TOOLS.display),
    ],
  },
  {
    // "You can plan up to two days in one answer: one planMeal call per meal." Saturday and Sunday
    // are four and five days after the bench's Tuesday.
    name: "fr · a weekend with its dishes plans each meal",
    locale: "fr",
    stock: [],
    question: "Planifie des lasagnes samedi soir et un dal dimanche midi pour 2",
    expect: (turn) => [
      _planned(turn, "lasagne", 4, "dinner", 2),
      _planned(turn, "dal", 5, "lunch", 2),
      _mustNot(turn, ASSISTANT_TOOLS.showButton),
    ],
  },
  {
    // "Three days or more, or their week, is the planner's job."
    name: "fr · three days go to the planner",
    locale: "fr",
    stock: [],
    question: "Planifie mes dîners de jeudi à samedi pour 2",
    expect: (turn) => {
      const button = _calls(turn, ASSISTANT_TOOLS.showButton)[0]?.input;
      return [
        _mustNot(turn, ASSISTANT_TOOLS.planMeal),
        _must(turn, ASSISTANT_TOOLS.showButton),
        !button || button.destination === "planning" || `showButton went to "${String(button.destination)}", not planning`,
      ];
    },
  },
  {
    // "Three days or more, or their week, is the planner's job: do not call planMeal."
    name: "fr · a whole week goes to the planner",
    locale: "fr",
    stock: [],
    question: "Planifie mes repas de la semaine",
    expect: (turn) => {
      const button = _calls(turn, ASSISTANT_TOOLS.showButton)[0]?.input;
      return [
        _mustNot(turn, ASSISTANT_TOOLS.planMeal),
        !button || button.destination === "planning" || `showButton went to "${String(button.destination)}", not planning`,
      ];
    },
  },
  {
    // "Further ahead, say so and point them to the planning screen." A failed call is an invariant miss.
    name: "en · three weeks out is beyond the chat",
    locale: "en",
    stock: [],
    question: "Plan lasagna for 4 on October 20",
    expect: (turn) => [_mustNot(turn, ASSISTANT_TOOLS.planMeal)],
  },

  /* Nothing to show. */
  {
    name: "fr · a technique question needs no card",
    locale: "fr",
    stock: [],
    question: "Combien de temps je cuis des spaghetti pour qu'ils soient al dente ?",
    expect: (turn) => [
      _mustNot(turn, ASSISTANT_TOOLS.display),
      _mustNot(turn, ASSISTANT_TOOLS.showSubstitutions),
      _mustNot(turn, ASSISTANT_TOOLS.showButton),
      _mustNot(turn, ASSISTANT_TOOLS.computeNutrition),
      _mustNot(turn, ASSISTANT_TOOLS.addToCellar),
      _mustNot(turn, ASSISTANT_TOOLS.removeFromCellar),
      _mustNot(turn, ASSISTANT_TOOLS.planMeal),
    ],
  },
];

/* ── The run ───────────────────────────────────────────────────────────────────────────── */

type Entrant = { model: string; effort: Effort; label: string };

type Result = {
  entrant: Entrant;
  case: Case;
  run: number;
  failures: string[];
  ms: number;
  /** When the first word of the answer arrived — what the shopper actually waits for. */
  firstTextMs?: number;
  tokens: number;
  cost?: number;
  turn?: Turn;
};

/** The fields of a step's content parts this file reads, whatever the part's type. */
type Part = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
};

/** The calls, in the order the model made them, each joined to its result or its error. */
const _trace = (steps: readonly { content: readonly unknown[]; text: string; finishReason: string }[]): Turn => {
  const calls = new Map<string, Call>();

  // Keyed by step AND call id: some providers restart their ids every step ("call_0" each time),
  // and keyed by id alone, a turn's display overwrote the searches that fed it.
  const parts = steps.flatMap((step, index) => (step.content as Part[]).map((part) => ({ part, key: `${index}:${part.toolCallId}` })));

  for (const { part, key } of parts) {
    if (!part.toolCallId) continue;
    if (part.type === "tool-call") calls.set(key, { tool: part.toolName ?? "unknown", input: (part.input ?? {}) as Record<string, unknown> });
    const call = calls.get(key);
    if (!call) continue;
    if (part.type === "tool-result") call.output = part.output;
    if (part.type === "tool-error") call.error = part.error instanceof Error ? part.error.message : String(part.error);
  }

  return {
    calls: [...calls.values()],
    // Every step's text, not only the last: what the cook reads is all of it, above and below cards.
    text: steps.map((step) => step.text).filter(Boolean).join("\n\n"),
    finish: steps[steps.length - 1]?.finishReason ?? "none",
  };
};

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const _message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const _runTurn = async (entrant: Entrant, testCase: Case, run: number): Promise<Result> => {
  const started = Date.now();
  let firstTextMs: number | undefined;
  let streamError: unknown;

  const base = { entrant, case: testCase, run };

  try {
    const result = streamText({
      model: openrouter.chat(entrant.model),
      system: assistantPrompt(testCase.locale),
      messages: [
        ...(testCase.history ?? []),
        appendBrief({ role: "user", content: testCase.question }, _brief(testCase.stock, testCase.locale, testCase.recipe)),
      ],
      tools: _tools(testCase.locale, testCase.stock, testCase.week ?? []),
      stopWhen: isStepCount(MAX_STEPS),
      providerOptions: routing(entrant.effort, ROUTING),
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && firstTextMs === undefined) firstTextMs = Date.now() - started;
      },
      onError: ({ error }) => {
        streamError = error;
      },
    });

    await result.consumeStream();
    if (streamError) throw streamError;

    const steps = await result.steps;
    const turn = _trace(steps);
    const usage = await result.totalUsage;
    // Summed over steps: each step is its own billed call, and the last one alone is not the turn.
    const costs = steps.map((step) => reportedCost(step.providerMetadata));

    return {
      ...base,
      turn,
      failures: [..._invariants(turn, testCase.stock), ...testCase.expect(turn).filter((miss): miss is string => miss !== true)],
      ms: Date.now() - started,
      firstTextMs,
      tokens: usage.totalTokens ?? 0,
      cost: costs.every((cost) => cost !== undefined) ? costs.reduce((sum, cost) => sum + cost, 0) : undefined,
    };
  } catch (error) {
    return {
      ...base,
      failures: [`the turn threw: ${_message(streamError ?? error).slice(0, 200)}`],
      ms: Date.now() - started,
      firstTextMs,
      tokens: 0,
    };
  }
};

/* ── The report ────────────────────────────────────────────────────────────────────────── */

const _median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN;
};
const _seconds = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "n/a");
const _usd = (value: number | undefined) => (value === undefined ? "n/a" : `$${value.toFixed(4)}`);

const _table = (entrants: Entrant[], results: Result[]) => {
  const width = Math.max(...CASES.map((testCase) => testCase.name.length)) + 2;
  const column = Math.max(12, ...entrants.map((entrant) => entrant.label.length + 2));
  const _cell = (entrant: Entrant, testCase: Case) =>
    results
      .filter((result) => result.entrant === entrant && result.case === testCase)
      .sort((a, b) => a.run - b.run)
      .map((result) => (result.failures.length ? "✗" : "✓"))
      .join("");

  const lines = [
    "".padEnd(width) + entrants.map((entrant) => entrant.label.padEnd(column)).join(""),
    ...CASES.map((testCase) => testCase.name.padEnd(width) + entrants.map((entrant) => _cell(entrant, testCase).padEnd(column)).join("")),
    "",
  ];

  for (const entrant of entrants) {
    const own = results.filter((result) => result.entrant === entrant);
    const passed = own.filter((result) => !result.failures.length).length;
    const costs = own.map((result) => result.cost);
    const spent = costs.every((cost) => cost !== undefined) ? costs.reduce((sum, cost) => sum + cost, 0) : undefined;

    lines.push(
      `${entrant.label.padEnd(column)} ${passed}/${own.length} passed · ` +
      `first word ${_seconds(_median(own.map((result) => result.firstTextMs ?? NaN)))} · ` +
      `whole turn ${_seconds(_median(own.map((result) => result.ms)))} (medians) · ` +
      `${Math.round(_median(own.map((result) => result.tokens)))} tokens/turn · ${_usd(spent)} spent`,
    );
  }

  return lines.join("\n");
};

/** Every failed turn in full, for the reader deciding whether the model or the case is wrong. */
const _transcript = (entrants: Entrant[], results: Result[]) => {
  const _call = (call: Call) =>
    `- **${call.tool}** \`${JSON.stringify(call.input)}\`\n` +
    (call.error !== undefined ? `  - ❌ ${call.error}\n` : `  - → \`${JSON.stringify(call.output)?.slice(0, 600)}\`\n`);

  const body = [
    `# assistant · tools, ${new Date().toISOString()}`,
    "",
    "```",
    _table(entrants, results),
    "```",
    "",
    `Catalog ids: ${[...Object.entries(R), ...Object.entries(I)].map(([key, id]) => `${key} ${id}`).join(", ")}.`,
    "",
    ...results
      .filter((result) => result.failures.length)
      .flatMap((result) => [
        `## ${result.case.name} · ${result.entrant.label} · run ${result.run + 1}`,
        "",
        `> ${result.case.question}`,
        "",
        ...result.failures.map((failure) => `- ⚠️ ${failure}`),
        "",
        ...(result.turn?.calls.map(_call) ?? []),
        "",
        "**Answer**",
        "",
        result.turn?.text || "_none_",
        "",
      ]),
  ].join("\n");

  const pad = (value: number) => String(value).padStart(2, "0");
  const now = new Date();
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
    `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../../agent/__bench__/runs", `assistant · tools_${stamp}.md`);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");

  return file;
};

describe("answerTurn — which model calls the tools right", () => {
  it("runs every case on every candidate", async () => {
    expect(process.env.OPENROUTER_API_KEY, "no real OPENROUTER_API_KEY — put one in .env.local").not.toMatch(/^test-/);

    const entrants = CANDIDATES.flatMap(({ name, modes }) =>
      modes.map((effort): Entrant => ({ model: name, effort, label: `${name.split("/").pop()}·${effort === false ? "off" : effort}` })),
    );
    // Run, then case, then entrant: the pool takes jobs in order, so this spreads what is in
    // flight across every model's provider rather than sending one model all of it at once.
    const jobs = Array.from({ length: RUNS }, (_, run) => run).flatMap((run) =>
      CASES.flatMap((testCase) => entrants.map((entrant) => ({ entrant, testCase, run }))),
    );

    console.log(`\n${entrants.length} models × ${CASES.length} cases × ${RUNS} runs = ${jobs.length} turns\n`);

    const results = await pool(
      jobs,
      MAX_CONCURRENCY,
      ({ entrant, testCase, run }) => _runTurn(entrant, testCase, run),
      (result, done, total) =>
        console.log(
          `[${String(done).padStart(3)}/${total}] ${result.failures.length ? "✗" : "✓"} ` +
          `${result.entrant.label} · ${result.case.name} · ${_seconds(result.ms)}` +
          (result.failures.length ? `\n        ${result.failures.join("\n        ")}` : ""),
        ),
    );

    console.log(`\n${_table(entrants, results)}\n\nEvery failed turn, in full: ${_transcript(entrants, results)}\n`);

    // Guards the harness, not the models: a field where no turn produced a trace is a dead key or
    // a dead slug, not a result. A model failing cases is the finding, read from the table.
    expect(results.filter((result) => result.turn).length).toBeGreaterThan(0);
  });
});
