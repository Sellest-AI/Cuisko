/**
 * A live check of `repairIngredient`'s one call: does the shipped model fill a weight that exists,
 * refuse one that does not, and give each nutrient in its unit?
 *
 * ⚠️ THIS COSTS MONEY — it calls OpenRouter for real: 3 runs of each case, then one judge call
 * over every case (`runSuite`). Run it by hand, after a prompt change:
 *
 *     pnpm test:manual repairIngredient
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local`. Nothing automatic runs this file: it
 * belongs to the `manual` project alone.
 *
 * The prompt, schema, user prompt and parser are imported from the tool, so what is scored is what
 * ships. `wrapAgent` is not shared: the harness calls the provider directly.
 *
 * **No food here is one the prompt names.** The prompt gives a slice of ham as 40 g and chicken as
 * the density nobody measures; a case built on either scores whether the model can copy its own
 * instructions, which it always can. Each food carries its own typical figures too, because the
 * model reads them as context and a feta shown a ham's macros is a question nobody asks.
 *
 * The cases from real recipe lines are not named by the prompt either: it gives a stock cube and
 * a pot of fromage blanc, they ask for a sugar cube and a pot of yogurt.
 */
import { describe, expect, it } from "vitest";

import type { RepairableField } from "@convex/schema/ingredientPayloads";

import { runSuite, type Candidate } from "../../__bench__";
import { REPAIR_INGREDIENT_PROMPT } from "../../config/prompts/repairIngredient";
import { parseModelOutput } from "../../utils";
import {
  repairIngredientSchema,
  repairIngredientUserPrompt,
  toRepairOutput,
  type RepairIngredientInput,
  type RepairIngredientOutput,
} from "../repairIngredient";

/** The incumbent: `ingredientsAgent` runs on `models.ingredients`, GPT-6 Luna at low effort. */
const CANDIDATES: Candidate[] = [{ name: "openai/gpt-6-luna", modes: ["low"] }];

type Check = (output: RepairIngredientOutput) => string[];

type Case = {
  title: string;
  food: RepairIngredientInput;
  check: Check;
};

/**
 * A food as a row holds it: both names, a category, how it is bought, and its four macros per 100 g.
 * `uses` are the recipe lines that write it, as the tool is shown them.
 */
const _food = (
  [fr, en]: [string, string],
  category: RepairIngredientInput["category"],
  defaultUnit: RepairIngredientInput["defaultUnit"],
  [calories, protein, fat, carbohydrates]: [number, number, number, number],
  missing: RepairableField[],
  uses?: RepairIngredientInput["uses"],
): RepairIngredientInput => ({
  names: { fr, en },
  category,
  defaultUnit,
  nutrition: { calories, protein, fat, carbohydrates },
  missing,
  ...(uses && { uses }),
});

/** The field answered, within `[min, max]`, and not refused. `why` is what a wrong answer means. */
const _within = (field: RepairableField, min: number, max: number, why: string): Check => ({ fields, refused }) => {
  if ((refused as RepairableField[]).includes(field)) return [`refused ${field} — ${why}`];
  const value = fields[field];

  return value === undefined || value < min || value > max ? [`${field} ${value} — ${why}`] : [];
};

/** The weight refused, and given no number. */
const _refuses = (field: RepairableField, why: string): Check => ({ fields, refused }) =>
  (refused as RepairableField[]).includes(field) && fields[field] === undefined ? [] : [`${field} ${fields[field]} — ${why}`];

const _all = (...checks: Check[]): Check => (output) => checks.flatMap((check) => check(output));

const CASES: Case[] = [
  // Weights the prompt never states.
  {
    title: "saumon fumé slice",
    food: _food(["Saumon fumé", "Smoked salmon"], "SEAFOOD", "g", [180, 22, 10, 0.5], ["gramsPerSlice"]),
    check: _within("gramsPerSlice", 15, 40, "a slice of smoked salmon is 20–30 g"),
  },
  {
    title: "avocat piece",
    food: _food(["Avocat", "Avocado"], "FRUIT", "pcs", [160, 2, 15, 1.9], ["gramsPerPiece"]),
    check: _within("gramsPerPiece", 150, 250, "one avocado is about 200 g"),
  },
  {
    title: "sauce soja density",
    food: _food(["Sauce soja", "Soy sauce"], "CONDIMENT", "ml", [60, 8, 0.5, 5], ["gramsPerMl"]),
    check: _within("gramsPerMl", 1.1, 1.25, "soy sauce is denser than water, about 1.15"),
  },

  // Weights with no answer.
  {
    title: "côte de porc density",
    food: _food(["Côte de porc", "Pork chop"], "MEAT", "pcs", [200, 19, 14, 0], ["gramsPerMl"]),
    check: _refuses("gramsPerMl", "nobody measures a pork chop in ml"),
  },
  {
    title: "semoule piece",
    food: _food(["Semoule de blé", "Semolina"], "GRAIN", "g", [360, 12, 1.5, 72], ["gramsPerPiece"]),
    check: _refuses("gramsPerPiece", "semolina has no piece"),
  },

  // Weights a cook does measure, however unlike the prompt's examples: refusing them is the error.
  {
    title: "sucre en poudre density",
    food: _food(["Sucre en poudre", "Caster sugar"], "SWEETENER", "g", [400, 0, 0, 100], ["gramsPerMl"]),
    check: _within("gramsPerMl", 0.7, 0.95, "sugar is spooned and measured in cups, about 0.85"),
  },
  {
    title: "ananas slice",
    food: _food(["Ananas", "Pineapple"], "FRUIT", "pcs", [50, 0.5, 0.1, 12], ["gramsPerSlice"]),
    check: _within("gramsPerSlice", 50, 120, "a round of pineapple is about 80 g"),
  },

  // Lines a real import wrote and the source confirms, which the shipped prompt refused: a pot, a
  // log and a sausage are what a recipe counts, and a chopped food is spooned. Each row is
  // as the catalog holds it, and each line is the recipe's own.
  {
    title: "yaourt nature piece",
    food: _food(["Yaourt nature", "Plain yogurt"], "DAIRY", "g", [61, 3.5, 3.3, 4.7], ["gramsPerPiece"], [
      { quantity: 1, unit: "pcs", recipeTitle: "Easy Chicken Korma" },
    ]),
    check: _within("gramsPerPiece", 100, 150, "\"1 yaourt\" is one pot, 125 g"),
  },
  {
    title: "fromage de chèvre piece",
    food: _food(["Fromage de chèvre", "Goat cheese"], "DAIRY", "g", [364, 22, 30, 2.5], ["gramsPerPiece"], [
      { quantity: 1, unit: "pcs", recipeTitle: "Vegetable Tian with Goat Cheese and Honey" },
    ]),
    check: _within("gramsPerPiece", 50, 250, "one goat cheese, a crottin or a log, is 60–200 g"),
  },
  {
    title: "chorizo piece",
    food: _food(["Chorizo", "Chorizo"], "MEAT", "g", [455, 24, 38, 1.9], ["gramsPerPiece"], [
      { quantity: 6, unit: "pcs", recipeTitle: "Easy Sausage Casserole" },
      { quantity: 1, unit: "pcs", recipeTitle: "Mixed Paella" },
    ]),
    check: _within("gramsPerPiece", 50, 250, "one chorizo sausage is 65–225 g"),
  },
  {
    title: "oignon density",
    food: _food(["Oignon", "Onion"], "VEGETABLE", "pcs", [40, 1.1, 0.1, 9.3], ["gramsPerMl"], [
      { quantity: 1, unit: "tbsp", recipeTitle: "Steak Tartare" },
      { quantity: 2, unit: "pcs", recipeTitle: "Soupe à l'oignon" },
    ]),
    check: _within("gramsPerMl", 0.4, 0.8, "a tablespoon of chopped onion is about 10 g"),
  },
  {
    title: "ananas density",
    food: _food(["Ananas", "Pineapple"], "FRUIT", "pcs", [50, 0.5, 0.1, 13], ["gramsPerMl"], [
      { quantity: 2, unit: "tbsp", recipeTitle: "Beef bulgogi stir-fry" },
    ]),
    check: _within("gramsPerMl", 0.5, 0.9, "chopped pineapple is spooned, about 0.7 g per ml"),
  },

  // Lines a real import linked to the wrong row. No answer is right, and the refusal is what flags
  // the line: a number here would weigh "4 tsp of fish fillet" as if it meant something.
  {
    title: "filet de poisson by the spoon",
    food: _food(["Filet de poisson", "Fish fillet"], "SEAFOOD", "pcs", [77.6, 18.1, 0.57, 0], ["gramsPerMl"], [
      { quantity: 4, unit: "tsp", recipeTitle: "Seafood Risotto" },
    ]),
    check: _refuses("gramsPerMl", "a fish fillet is never spooned; the line meant fish stock"),
  },
  {
    title: "frites by the spoon",
    food: _food(["Frites", "French fries"], "VEGETABLE", "g", [312, 3.4, 15, 41], ["gramsPerMl"], [
      { quantity: 3.5, unit: "tsp", recipeTitle: "General Tso's chicken" },
    ]),
    check: _refuses("gramsPerMl", "fries are never spooned; the line meant potato flour"),
  },
  {
    title: "sucre blanc piece",
    food: _food(["Sucre blanc", "White sugar"], "SWEETENER", "g", [387, 0, 0, 100], ["gramsPerPiece"], [
      { quantity: 30, unit: "pcs", recipeTitle: "Vietnamese Caramel Pork" },
      { quantity: 1, unit: "tbsp", recipeTitle: "Crêpes" },
    ]),
    check: _refuses("gramsPerPiece", "white sugar is sold loose; 30 pieces are sugar cubes, another row"),
  },
  {
    title: "sauce chili douce piece",
    food: _food(["Sauce chili douce", "Sweet chilli sauce"], "CONDIMENT", "ml", [188, 0.5, 0.2, 46], ["gramsPerPiece"], [
      { quantity: 1, unit: "pcs", recipeTitle: "Garlic Shrimp" },
    ]),
    check: _refuses("gramsPerPiece", "a sauce has no piece, and no recipe uses a whole bottle"),
  },
  {
    title: "cube de bouillon d'agneau density",
    food: _food(["Cube de bouillon d'agneau", "Lamb stock cube"], "OTHER", "pcs", [250, 10, 15, 20], ["gramsPerMl"], [
      { quantity: 300, unit: "ml", recipeTitle: "Goat curry" },
      { quantity: 3, unit: "l", recipeTitle: "Scotch broth" },
    ]),
    check: _refuses("gramsPerMl", "a cube is not poured; 300 ml is the stock made from it"),
  },

  // Nutrients, where the risk is the unit: sodium in mg, not salt, not grams.
  {
    title: "feta sodium",
    food: _food(["Feta", "Feta"], "DAIRY", "g", [265, 14, 21, 1.5], ["sodium"]),
    check: _within("sodium", 800, 1400, "feta holds about 1100 mg of sodium; 2.8 is its salt in grams"),
  },
  {
    title: "lentilles iron",
    food: _food(["Lentilles vertes crues", "Raw green lentils"], "LEGUME", "g", [330, 24, 1.5, 48], ["iron"]),
    check: _within("iron", 5, 10, "raw lentils hold about 7 mg of iron"),
  },
  {
    title: "miel sugars",
    food: _food(["Miel", "Honey"], "SWEETENER", "g", [320, 0.4, 0, 82], ["sugars"]),
    check: _within("sugars", 70, 82, "nearly all of honey's 82 g of carbohydrates is sugar, and never more"),
  },

  // A whole repair, as a save asks it: a weight and the four score nutrients at once.
  {
    title: "avocat mixed",
    food: _food(
      ["Avocat", "Avocado"],
      "FRUIT",
      "pcs",
      [160, 2, 15, 1.9],
      ["gramsPerPiece", "saturatedFat", "sugars", "fiber", "sodium"],
    ),
    check: _all(
      _within("gramsPerPiece", 150, 250, "one avocado is about 200 g"),
      _within("saturatedFat", 1.5, 3.5, "about 2 g of an avocado's 15 g of fat is saturated"),
      _within("sugars", 0, 1.9, "avocado has under 1 g of sugars, and never more than its 1.9 g of carbohydrates"),
      _within("fiber", 4, 8, "avocado holds about 6.7 g of fiber"),
      _within("sodium", 0, 20, "avocado holds about 7 mg of sodium"),
    ),
  },
];

/** One case as the suite runs it: the tool's real user prompt, schema and parser for that food. */
const _suiteCase = ({ title, food, check }: Case) => {
  const schema = repairIngredientSchema(food.missing);

  return {
    title,
    prompt: repairIngredientUserPrompt(food),
    answer: {
      schema,
      parse: (raw: unknown) =>
        toRepairOutput(food.missing, parseModelOutput(schema, raw) as Parameters<typeof toRepairOutput>[1]),
      check,
    },
  };
};

describe("repairIngredient · live", () => {
  // One test, one judge over every case: the judge sees the model's whole spread, and is paid once.
  it("fills, refuses and converts across every case", { timeout: 900_000 }, async () => {
    const { cases } = await runSuite({
      title: "repairIngredient",
      candidates: CANDIDATES,
      system: REPAIR_INGREDIENT_PROMPT,
      cases: CASES.map(_suiteCase),
      criteria: ["Is each figure a true typical value for this raw food, in its unit, and is each refusal a weight nobody measures?"],
      runs: 3,
    });

    // `clean`, not `ok` alone: a flagged run still counts as `ok`. The sibling bake-offs compare a
    // field of models and leave a fully flagged one to be read; this file scores the one model that
    // ships, so a case it fails on every run is the shipped prompt's regression, and must be red.
    // Every case is checked before the assertion, so one red run names every case that failed.
    const failing = cases.filter(({ result }) => !result.clean).map(({ title }) => title);
    expect(failing).toEqual([]);
  });
});
