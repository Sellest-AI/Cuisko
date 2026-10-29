import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import type { RecipeUnit } from "@shared/ingredients";

import schema from "../../../schema";
import { type CookingRecipe, recipeBrief } from "../recipeBrief";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

/** A gratin written for 4: two groups, so the numbering has a boundary to cross. */
const GRATIN = {
  title: { fr: "Gratin dauphinois", en: "Gratin dauphinois" },
  instructions: {
    fr: "Préparation\n- Éplucher les pommes de terre\n- Les couper en rondelles\n\nCuisson\n- Verser la crème\n- Enfourner 1 h",
    en: "Prep\n- Peel the potatoes\n- Slice them\n\nBaking\n- Pour the cream\n- Bake for 1 h",
  },
  lines: [
    { fr: "pomme de terre", en: "potato", quantity: 1000, unit: "g" },
    { fr: "crème liquide", en: "single cream", quantity: 50, unit: "cl" },
  ] as { fr: string; en: string; quantity: number; unit: RecipeUnit }[],
};

const insertGratin = ({ isArchived = false }: { isArchived?: boolean } = {}) =>
  t.run(async (ctx) => {
    const recipeId = await insertTestRecipe(ctx.db, {
      isArchived,
      title: { values: GRATIN.title, meta: {} },
      description: { values: { fr: "x" }, meta: {} },
      instructions: { values: GRATIN.instructions, meta: {} },
      servings: 4,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isNutFree: true,
    });

    for (const [position, { fr, en, quantity, unit }] of GRATIN.lines.entries()) {
      const ingredientId = await ctx.db.insert("ingredients", {
        name: { values: { fr, en }, meta: {} },
        category: "VEGETABLE",
        emoji: "🥔",
        defaultUnit: "g",
        defaultQuantity: 1,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      });
      await ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position, quantity, unit, updatedAt: Date.now() });
    }

    return recipeId;
  });

const briefOf = (recipe: CookingRecipe, locale: "fr" | "en" = "fr") =>
  t.run((ctx) => recipeBrief(ctx, { recipe, locale }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/assistant/recipeBrief", () => {
  test("names the dish, both servings, every line scaled to the cook's, and the step they are on", async () => {
    const id = await insertGratin();

    expect(await briefOf({ id, step: 3, servings: 2 }, "en")).toBe(
      [
        "<recipe>",
        "name: Gratin dauphinois",
        "written for: 4",
        "cooking for: 2",
        "scaled ingredients:",
        "- 500 g potato",
        "- 25 cl single cream",
        "not-scaled steps:",
        "1. (Prep) Peel the potatoes",
        "2. (Prep) Slice them",
        "3. (Baking) Pour the cream",
        "4. (Baking) Bake for 1 h",
        "current step: 3",
        "</recipe>",
      ].join("\n"),
    );
  });

  test("numbers the steps in one run across groups, as the cooking screen does", async () => {
    const id = await insertGratin();

    const brief = await briefOf({ id });

    expect(brief).toContain("2. (Préparation) Les couper en rondelles");
    expect(brief).toContain("3. (Cuisson) Verser la crème");
  });

  test("leaves out what the cooking screen did not send, and the lines stay as written", async () => {
    const id = await insertGratin();

    const brief = await briefOf({ id });

    expect(brief).toContain("written for: 4");
    expect(brief).toContain("- 1000 g pomme de terre");
    expect(brief).not.toContain("cooking for");
    expect(brief).not.toContain("current step");
  });

  /** Rounded as the screen draws it: centilitres are whole, so a quarter of 50 cl is 13 cl, not 12.5. */
  test("rounds a scaled line to its unit's precision", async () => {
    const id = await insertGratin();

    expect(await briefOf({ id, servings: 3 })).toContain("- 750 g pomme de terre");
    expect(await briefOf({ id, servings: 1 }, "en")).toContain("- 13 cl single cream");
  });

  test("drops a step outside the method and servings the stepper cannot reach, keeps the rest", async () => {
    const id = await insertGratin();

    for (const recipe of [
      { id, step: 0, servings: 0 },
      { id, step: 5, servings: 1.5 },
      { id, step: 2.5, servings: -2 },
      { id, servings: 9 },
    ]) {
      const brief = await briefOf(recipe);

      expect(brief).not.toContain("current step");
      expect(brief).not.toContain("cooking for");
      expect(brief).toContain("- 1000 g pomme de terre");
      expect(brief).toContain("1. (Préparation) Éplucher les pommes de terre");
    }
  });

  test("an archived recipe still reads: a read by id never asks (ADR 0017)", async () => {
    const id = await insertGratin({ isArchived: true });

    expect(await briefOf({ id })).toContain("name: Gratin dauphinois");
  });

  test("an id that names nothing gives no block rather than refusing the question", async () => {
    const id = await insertGratin();
    await t.run((ctx) => ctx.db.delete(id));

    // Compared inside the run: `t.run` hands an `undefined` back as `null`.
    const isAbsent = await t.run(async (ctx) => (await recipeBrief(ctx, { recipe: { id }, locale: "fr" })) === undefined);

    expect(isAbsent).toBe(true);
  });

  test("carries no id the model could recite (ADR 0010)", async () => {
    const id = await insertGratin();

    expect(await briefOf({ id })).not.toContain(id);
  });
});
