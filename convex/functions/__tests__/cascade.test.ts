import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { cascadeDelete } from "../cascade";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const insertImage = (url: string) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: `public/${url}`,
      url,
      width: 768,
      height: 512,
      size: 100_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    }),
  );

const insertRecipe = (
  fields: { userId?: Id<"users">; coverImageId?: Id<"images">; plateImageId?: Id<"images"> } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: "Base\n- Émincer les oignons." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { en: "", fr: "" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      ...fields,
      updatedAt: Date.now(),
    }),
  );

const insertUser = () => t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

const insertHousehold = () =>
  t.run((ctx) =>
    ctx.db.insert("households", {
      name: "Maison",
      inviteCode: "ABCDEF",
      updatedAt: Date.now(),
    }),
  );

const insertIngredient = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "oignon", en: "onion" }, meta: {} },
      search: { fr: "oignon", en: "onion" },
      category: "OTHER",
      emoji: "🧅",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    }),
  );

const insertMealPlan = (householdId: Id<"households">) =>
  t.run((ctx) =>
    ctx.db.insert("mealPlans", {
      householdId,
      startDate: Date.now(),
      days: 7,
      slots: ["lunch", "dinner"],
      people: 2,
      seed: 1234,
      updatedAt: Date.now(),
    }),
  );

const insertPlannedMeal = (
  mealPlanId: Id<"mealPlans">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  fields: { ingredientId?: Id<"ingredients">; groceryListItemId?: Id<"groceryListItems">; cellarItemId?: Id<"cellarItems"> } = {},
) =>
  t.run(async (ctx) => {
    const mealId = await ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId,
      recipeId,
      date: Date.now(),
      slot: "lunch",
      servings: 2,
      status: "planned",
      updatedAt: Date.now(),
    });

    if (fields.ingredientId) {
      await ctx.db.insert("plannedMealIngredients", {
        plannedMealId: mealId,
        ingredientId: fields.ingredientId,
        sourceQuantity: 1,
        sourceUnit: "pcs",
        quantity: 1,
        unit: "pcs",
        groceryQuantity: fields.groceryListItemId ? 1 : undefined,
        groceryListItemId: fields.groceryListItemId,
        cellarItemId: fields.cellarItemId,
        updatedAt: Date.now(),
      });
    }

    return mealId;
  });

const insertGroceryListItem = (householdId: Id<"households">, ingredientId: Id<"ingredients">) =>
  t.run((ctx) =>
    ctx.db.insert("groceryListItems", {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 1,
      updatedAt: Date.now(),
    }),
  );

const insertCellarItem = (householdId: Id<"households">, ingredientId: Id<"ingredients">) =>
  t.run((ctx) =>
    ctx.db.insert("cellarItems", {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 1,
      updatedAt: Date.now(),
    }),
  );

/** The image ids queued for deletion, in the order they were scheduled. */
const scheduledDeletions = async () => {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.map((job) => (job.args[0] as { imageId: Id<"images"> }).imageId);
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("cascadeDelete", () => {
  describe("delete-image-tree", () => {
    test("queues both of a deleted recipe's photos for deletion", async () => {
      const coverImageId = await insertImage("cover.webp");
      const plateImageId = await insertImage("plate.webp");
      const recipeId = await insertRecipe({ coverImageId, plateImageId });

      await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

      expect(await t.run((ctx) => ctx.db.get(recipeId))).toBeNull();
      expect(await scheduledDeletions()).toEqual([coverImageId, plateImageId]);
    });

    test("schedules nothing for a recipe with no photos", async () => {
      const recipeId = await insertRecipe();

      await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

      expect(await t.run((ctx) => ctx.db.get(recipeId))).toBeNull();
      expect(await scheduledDeletions()).toEqual([]);
    });
  });

  test("deletes the rows that reference the deleted row", async () => {
    const userId = await insertUser();
    const recipeId = await insertRecipe();
    await t.run((ctx) => ctx.db.insert("recipeFavorites", { userId, recipeId }));

    await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

    expect(await t.run((ctx) => ctx.db.query("recipeFavorites").collect())).toEqual([]);
  });

  /**
   * A recipe outlives its author. Pinned because the rule used to be a delete, and a delete would
   * also have queued the recipe's photos — detaching must leave both the row and its images alone.
   */
  test("detaches a recipe from its deleted author and keeps its photos", async () => {
    const userId = await insertUser();
    const coverImageId = await insertImage("cover.webp");
    const recipeId = await insertRecipe({ userId, coverImageId });

    await t.run((ctx) => cascadeDelete(ctx, "users", userId));

    const recipe = await t.run((ctx) => ctx.db.get(recipeId));
    expect(recipe).not.toBeNull();
    expect(recipe?.userId).toBeUndefined();
    expect(recipe?.coverImageId).toBe(coverImageId);
    expect(await scheduledDeletions()).toEqual([]);
  });

  test("is a no-op for a row that is already gone", async () => {
    const recipeId = await insertRecipe();
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId))).resolves.toBeNull();
    expect(await scheduledDeletions()).toEqual([]);
  });
});

describe("cascadeDelete — planning", () => {
  /**
   * A household is the root of the planning tree. Deleting it must take the whole run with it:
   * the week, every plate, and every ledger line — the cascade is three levels deep, and the
   * failure this guards against is a delete that stops one level short and leaves orphans.
   */
  test("deletes a household's plan, its meals and their ledger lines", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const mealPlanId = await insertMealPlan(householdId);
    const mealId = await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "households", householdId));

    expect(await t.run((ctx) => ctx.db.get(householdId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(mealPlanId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(mealId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect())).toEqual([]);
  });

  test("deletes a meal plan's plates and their ledger lines", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const mealPlanId = await insertMealPlan(householdId);
    const mealId = await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "mealPlans", mealPlanId));

    expect(await t.run((ctx) => ctx.db.get(mealPlanId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(mealId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect())).toEqual([]);
  });

  test("deletes a planned meal's ledger lines", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const mealPlanId = await insertMealPlan(householdId);
    const mealId = await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "plannedMeals", mealId));

    expect(await t.run((ctx) => ctx.db.get(mealId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect())).toEqual([]);
  });

  /**
   * Deleting a recipe takes its planned plates with it — the cascade reaches across the
   * `plannedMeals` table — but the grocery quantities those plates contributed stay on the list.
   * That is the "deleting a recipe orphans its groceries" decision in the plan, and it is why the
   * ledger row detaches from the grocery item rather than being deleted with it.
   */
  test("deletes a recipe's planned meals but leaves its contributed groceries on the list", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const groceryItemId = await insertGroceryListItem(householdId, ingredientId);
    const mealPlanId = await insertMealPlan(householdId);
    await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
      groceryListItemId: groceryItemId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

    expect(await t.run((ctx) => ctx.db.query("plannedMeals").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(groceryItemId))).not.toBeNull();
  });

  /**
   * The other direction of the same asymmetry: deleting the grocery item must not take the ledger
   * row with it. A ledger line is a reservation against the cellar, and the grocery list is where
   * the missing part came from — the line outlives both the shopping trip and the list row.
   */
  test("detaches a ledger line from its deleted grocery item", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const groceryItemId = await insertGroceryListItem(householdId, ingredientId);
    const mealPlanId = await insertMealPlan(householdId);
    await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
      groceryListItemId: groceryItemId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "groceryListItems", groceryItemId));

    expect(await t.run((ctx) => ctx.db.get(groceryItemId))).toBeNull();
    const lines = await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect());
    expect(lines).toHaveLength(1);
    expect(lines[0]!.groceryListItemId).toBeUndefined();
    expect(lines[0]!.groceryQuantity).toBe(1);
  });

  /**
   * The same contract on the cellar side: a ledger line names the lot it was reserved against,
   * and that lot can be removed (emptied and re-shopped) without the reservation going with it.
   * Every reader falls back to the ingredient lookup when the stored id points at nothing.
   */
  test("detaches a ledger line from its deleted cellar item", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const cellarItemId = await insertCellarItem(householdId, ingredientId);
    const mealPlanId = await insertMealPlan(householdId);
    await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
      cellarItemId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "cellarItems", cellarItemId));

    expect(await t.run((ctx) => ctx.db.get(cellarItemId))).toBeNull();
    const lines = await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect());
    expect(lines).toHaveLength(1);
    expect(lines[0]!.cellarItemId).toBeUndefined();
  });

  /**
   * Deleting an ingredient removes the ledger lines that reference it — the cascade reaches into
   * the planning ledger from the catalog side, which is the path the delete-image-tree rule and
   * the recipe cascade do not cover.
   */
  test("deletes ledger lines referencing a deleted ingredient", async () => {
    const householdId = await insertHousehold();
    const ingredientId = await insertIngredient();
    const recipeId = await insertRecipe();
    const mealPlanId = await insertMealPlan(householdId);
    await insertPlannedMeal(mealPlanId, householdId, recipeId, {
      ingredientId,
    });

    await t.run((ctx) => cascadeDelete(ctx, "ingredients", ingredientId));

    expect(await t.run((ctx) => ctx.db.get(ingredientId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect())).toEqual([]);
  });
});
