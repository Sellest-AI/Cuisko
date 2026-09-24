import type { Id } from "@convex/_generated/dataModel";
import type { NutritionFigures } from "@convex/functions/recipes/computeNutrition";
import { describe, expect, it, vi } from "vitest";

import { toNutritionOutput } from "../computeNutrition";
import { searchIngredientsTool } from "../searchIngredients";
import { searchRecipesTool } from "../searchRecipes";

/**
 * Every object key anywhere in `value` that Convex would refuse as a field name.
 *
 * The agent stores each tool's output in its messages table, and Convex rejects a document whose
 * field names are not printable ASCII. A key built from data, "gnocchis poêlées" say, fails the save
 * of the whole message, and the turn dies after the model has already done its work. It happened:
 * `searchRecipes` once keyed its results by the names searched.
 */
const _refusedKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(_refusedKeys);
  if (typeof value !== "object" || value === null) return [];

  return Object.entries(value).flatMap(([key, child]) => [
    // Printable ASCII only, which is the rule the save enforces.
    ...(/^[\x20-\x7E]+$/.test(key) ? [] : [key]),
    ..._refusedKeys(child),
  ]);
};

/** Accented names on purpose: the French catalog is full of them, and that is what broke. */
const NAMES = ["gnocchis poêlées", "crêpes", "pâtes à l'ail"];

const _runQuery = (answer: (query: string) => unknown) =>
  vi.fn(async (_ref: unknown, { query }: { query: string }) => answer(query));

describe("what a tool hands back can be stored", () => {
  /** The walk itself, so a passing test below means the keys are fine, not that nothing was read. */
  it("catches a name used as a key, however deep", () => {
    expect(_refusedKeys({ results: [{ recipes: { "gnocchis poêlées": [] } }] })).toEqual(["gnocchis poêlées"]);
  });

  it("searchRecipes", async () => {
    const tool = searchRecipesTool({ userId: "user" as Id<"users">, locale: "fr" });
    const ctx = { runQuery: _runQuery((query) => [{ id: `id-${query}`, title: `${query} maison` }]) };

    const found = await tool.run(ctx as unknown as Parameters<typeof tool.run>[0], { queries: NAMES });

    expect(_refusedKeys(found)).toEqual([]);
  });

  it("searchIngredients", async () => {
    const tool = searchIngredientsTool({ locale: "fr" });
    const ctx = {
      runQuery: _runQuery((query) => [
        {
          _id: `id-${query}`,
          name: query,
          nutrition: { calories: 142, protein: 12, fat: 9, carbohydrates: 1 },
          gramsPerPiece: 50,
        },
      ]),
    };

    const found = await tool.run(ctx as unknown as Parameters<typeof tool.run>[0], { queries: NAMES });

    expect(_refusedKeys(found)).toEqual([]);
  });

  it("computeNutrition", () => {
    const facts = { calories: 70, protein: 6, fat: 5, carbohydrates: 1 };
    const figures: NutritionFigures = {
      servings: 2,
      grams: 300,
      total: facts,
      perServing: facts,
      per100g: facts,
      lines: NAMES.map((name) => ({ name, quantity: 100, unit: "g", grams: 100, ...facts })),
    };
    const recipes = NAMES.map((title, index) => ({ id: `r${index}`, title, ...figures }));

    expect(_refusedKeys(toNutritionOutput({ kind: "lines", missing: [], unweighable: [], figures }))).toEqual([]);
    expect(_refusedKeys(toNutritionOutput({ kind: "recipes", missing: [], recipes }))).toEqual([]);
  });
});
