import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { RecipeUnit } from "@shared/ingredients";
import { roundFacts } from "@shared/nutrition";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { computeNutrition, type NutritionFigures } from "../computeNutrition";
import { loadRecipe } from "../loadRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

/** Round per-100 g figures, so every expected value below can be checked by hand. */
const seedIngredient = (
  name: string,
  {
    gramsPerPiece,
    edibleShare,
    category = "VEGETABLE",
  }: { gramsPerPiece?: number; edibleShare?: number; category?: "VEGETABLE" | "DAIRY" } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { en: name, fr: name }, meta: {} },
      category,
      emoji: "🥚",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 140, protein: 12, fat: 10, carbohydrates: 2 },
      updatedAt: Date.now(),
      ...(gramsPerPiece !== undefined && { gramsPerPiece }),
      ...(edibleShare !== undefined && { edibleShare }),
    }),
  );

const seedRecipe = (
  title: string,
  servings: number,
  lines: { ingredientId: Id<"ingredients">; quantity: number; unit: RecipeUnit }[],
) =>
  t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { en: title, fr: title }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      servings,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "french",
      timings: {},
      search: { en: "", fr: "" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    });

    for (const [position, line] of lines.entries()) {
      await ctx.db.insert("recipeIngredients", { recipeId, position, ...line, updatedAt: Date.now() });
    }

    return recipeId;
  });

const compute = (args: Omit<Parameters<typeof computeNutrition>[1], "locale">) =>
  t.run((ctx) => computeNutrition(ctx, { ...args, locale: "en" }));

describe("functions/recipes/computeNutrition", () => {
  /** "How many calories in an egg": one piece, weighed from the row, never guessed. */
  test("weighs one egg from its row and counts it", async () => {
    const egg = await seedIngredient("Egg", { gramsPerPiece: 50 });

    const answer = await compute({ lines: [{ ingredientId: egg, quantity: 1, unit: "pcs" }] });

    expect(answer).toMatchObject({
      kind: "lines",
      missing: [],
      unweighable: [],
      figures: {
        servings: 1,
        grams: 50,
        total: { calories: 70, protein: 6, fat: 5, carbohydrates: 1 },
        perServing: { calories: 70, protein: 6, fat: 5, carbohydrates: 1 },
        per100g: { calories: 140, protein: 12, fat: 10, carbohydrates: 2 },
        lines: [{ name: "Egg", quantity: 1, unit: "pcs", grams: 50, calories: 70 }],
      },
    });
  });

  /**
   * A weight is as bought and the facts are per 100 g eaten, so only the eaten share is counted:
   * in the total, in the line's own share, and in the grams every per-100 g figure is read against.
   * What the cook bought stays in the quantity, which is what they read on the recipe.
   */
  test("counts only the share of a line that is eaten, and still quotes what was bought", async () => {
    const mussels = await seedIngredient("Mussels", { gramsPerPiece: 100, edibleShare: 0.4 });

    const answer = await compute({ lines: [{ ingredientId: mussels, quantity: 1, unit: "pcs" }] });

    expect(answer).toMatchObject({
      figures: {
        grams: 40,
        total: { calories: 56, fat: 4 },
        per100g: { calories: 140, fat: 10 },
        lines: [{ quantity: 1, unit: "pcs", grams: 40, calories: 56 }],
      },
    });
  });

  /** The one-producer check: the assistant and the recipe screen read the same figure. */
  test("gives a recipe the figures the recipe screen shows", async () => {
    const egg = await seedIngredient("Egg", { gramsPerPiece: 50 });
    const butter = await seedIngredient("Butter", { category: "DAIRY" });
    const recipeId = await seedRecipe("Omelette", 2, [
      { ingredientId: egg, quantity: 3, unit: "pcs" },
      { ingredientId: butter, quantity: 15, unit: "g" },
    ]);

    const [answer, page] = await t.run(async (ctx) => [
      await computeNutrition(ctx, { recipeIds: [recipeId], locale: "en" }),
      await loadRecipe(ctx, { recipe: recipeId, locale: "en" }),
    ]);

    if (answer.kind !== "recipes") throw new Error("expected recipes");
    const figures = answer.recipes[0] as NutritionFigures & { id: string; title: string };

    expect(figures.id).toBe(recipeId);

    expect(figures.title).toBe("Omelette");
    expect(figures.servings).toBe(2);
    expect(figures.perServing).toEqual(roundFacts(page.nutrition!.perServing));
    expect(figures.total).toEqual(roundFacts(page.nutrition!.total));
    expect(figures.lines.map(({ name, grams }) => [name, grams])).toEqual([["Egg", 150], ["Butter", 15]]);
  });

  test("scales the batch to the servings asked, and leaves the portion alone", async () => {
    const egg = await seedIngredient("Egg", { gramsPerPiece: 50 });
    const recipeId = await seedRecipe("Eggs", 2, [{ ingredientId: egg, quantity: 2, unit: "pcs" }]);

    const answer = await compute({ recipeIds: [recipeId], servings: 4 });

    if (answer.kind !== "recipes") throw new Error("expected recipes");
    expect(answer.recipes[0]).toMatchObject({
      servings: 4,
      grams: 200,
      total: { calories: 280 },
      perServing: { calories: 70 },
      lines: [{ quantity: 4, grams: 200 }],
    });
  });

  test("answers for the recipes when recipes and lines are both given", async () => {
    const egg = await seedIngredient("Egg", { gramsPerPiece: 50 });
    const recipeId = await seedRecipe("Eggs", 1, [{ ingredientId: egg, quantity: 1, unit: "pcs" }]);

    const answer = await compute({
      recipeIds: [recipeId],
      lines: [{ ingredientId: egg, quantity: 10, unit: "pcs" }],
    });

    expect(answer.kind).toBe("recipes");
  });

  /** ADR 0010: an id the model mangled comes back named, so the tool can throw on it. */
  test("names every id that is not a row, for recipes and for lines", async () => {
    const recipeId = await seedRecipe("Gone", 1, []);
    await t.run((ctx) => ctx.db.delete(recipeId));

    expect(await compute({ recipeIds: [recipeId, "not-an-id"] })).toMatchObject({
      missing: [recipeId, "not-an-id"],
      recipes: [],
    });
    expect(
      await compute({ lines: [{ ingredientId: "not-an-id", quantity: 1, unit: "g" }] }),
    ).toMatchObject({ missing: ["not-an-id"] });
  });

  test("refuses an egg in millilitres, and offers the units it can be weighed in", async () => {
    const egg = await seedIngredient("Egg", { gramsPerPiece: 50 });

    const answer = await compute({ lines: [{ ingredientId: egg, quantity: 50, unit: "ml" }] });

    expect(answer).not.toHaveProperty("figures");
    expect(answer).toMatchObject({ unweighable: [{ ingredientId: egg, name: "Egg", unit: "ml" }] });
    if (answer.kind !== "lines") throw new Error("expected lines");
    expect(answer.unweighable[0]?.units).toEqual(expect.arrayContaining(["g", "pcs"]));
    expect(answer.unweighable[0]?.units).not.toContain("ml");
  });

  /** One dish that cannot be totalled must not cost the others in the same call their figures. */
  test("marks a recipe it cannot total as unavailable, and still answers the others", async () => {
    const egg = await seedIngredient("Egg", { gramsPerPiece: 50 });
    const onion = await seedIngredient("Onion");
    const complete = await seedRecipe("Eggs", 1, [{ ingredientId: egg, quantity: 1, unit: "pcs" }]);
    const partial = await seedRecipe("Onions", 1, [{ ingredientId: onion, quantity: 2, unit: "pcs" }]);

    const answer = await compute({ recipeIds: [complete, partial] });

    if (answer.kind !== "recipes") throw new Error("expected recipes");
    const [first, second] = answer.recipes;
    expect(first).toMatchObject({ id: complete, total: expect.any(Object) });
    expect(second).toMatchObject({ id: partial, title: "Onions", unavailable: expect.any(String) });
    expect(second).not.toHaveProperty("total");
  });
});
