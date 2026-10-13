import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { UNDO_WINDOW_MS } from "@shared/groceries";
import type { Unit } from "@shared/ingredients";

import type { Id } from "../../../_generated/dataModel";
import { api, internal } from "../../../_generated/api";
import schema from "../../../schema";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/cellars/removeFromCellar."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const seedHousehold = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", {
      name: "Home",
      equipments: [],
      inviteCode: "ABC123",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("householdUsers", { householdId, userId });

    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Egg" }, meta: {} },
      category: "EGG",
      emoji: "🥚",
      defaultUnit: "pcs",
      defaultQuantity: 6,
      nutrition: { calories: 70, protein: 6, fat: 5, carbohydrates: 0 },
      updatedAt: Date.now(),
    });

    const flourId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Flour" }, meta: {} },
      category: "GRAIN",
      emoji: "🌾",
      defaultUnit: "g",
      defaultQuantity: 1000,
      nutrition: { calories: 364, protein: 10, fat: 1, carbohydrates: 76 },
      updatedAt: Date.now(),
    });

    return { userId, householdId, ingredientId, flourId };
  });

/** The scaffolding a ledger claim hangs off: one plan, one plate on it, from a one-recipe library. */
const seedPlate = (t: ReturnType<typeof convexTest>, householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { fr: "Soupe" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 0.5,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
      updatedAt: Date.now(),
    });
    const mealPlanId = await ctx.db.insert("mealPlans", {
      householdId,
      startDate: 0,
      days: 1,
      slots: ["lunch"],
      people: 2,
      seed: 0.5,
      updatedAt: Date.now(),
    });

    return ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId,
      recipeId,
      date: 0,
      slot: "lunch",
      servings: 2,
      status: "planned",
      updatedAt: Date.now(),
    });
  });

/**
 * A claim the purchase settled, as `addToCellar` leaves it: the list row struck, the claim
 * anchored to the lot the purchase landed on, its grocery quantity remembered.
 */
const seedBoughtClaim = async (
  t: ReturnType<typeof convexTest>,
  householdId: Id<"households">,
  ingredientId: Id<"ingredients">,
  cellarItemId: Id<"cellarItems">,
  settledAt: number,
  bought: { quantity: number; unit: Unit } = { quantity: 4, unit: "pcs" },
) => {
  const plannedMealId = await seedPlate(t, householdId);

  return t.run((ctx) =>
    ctx.db.insert("plannedMealIngredients", {
      plannedMealId,
      ingredientId,
      sourceQuantity: bought.quantity,
      sourceUnit: bought.unit,
      quantity: bought.quantity,
      unit: bought.unit,
      groceryQuantity: bought.quantity,
      groceryListItemId: undefined,
      cellarItemId,
      updatedAt: settledAt,
    }));
};

describe("router/cellars/removeFromCellar", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    await t.run((ctx) =>
      ctx.db.insert("usersExtended", { userId: outsiderId, role: "USER", updatedAt: Date.now() }),
    );

    await expect(
      t
        .withIdentity(asUser(outsiderId))
        .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
  });

  test("throws when no matching cellar item exists", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t
        .withIdentity(asUser(userId))
        .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
  });

  test("decrements the quantity on a partial removal, without touching recently-used", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 6, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 2 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(4);

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(0);
  });

  test("emptying the row deletes it and records it as recently used", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(0);

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(1);
    expect(recentlyUsed[0]!.quantity).toBe(4);
  });

  /**
   * The defect the five-minute rule caused, pinned: stock the shopper bought seconds ago and
   * nobody had asked for used to come back as a grocery line they never wrote.
   */
  test("a removal with no restoreToList leaves nothing on the grocery list, however fresh the row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(0);
  });

  test("restores exactly the quantity the caller asked for, not the whole removal", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 9, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 9,
      restoreToList: 3,
    });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(1);
    expect(groceryList[0]!.quantity).toBe(3);
  });

  test("an undo is not running out — restoring suppresses the recently-used entry", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);
  });

  test("restores on a partial removal too, leaving the rest on the shelf", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 10, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items[0]!.quantity).toBe(6);

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(1);
    expect(groceryList[0]!.quantity).toBe(4);
  });

  test("merges what it restores into the line already carrying that ingredient", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() });
      await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "pcs", quantity: 2, updatedAt: Date.now() });
    });

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(1);
    expect(groceryList[0]!.quantity).toBe(6);
  });

  test("treats restoreToList: 0 as no restore at all", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 0,
    });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(0);

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(1);
  });

  /**
   * The undo's whole point: a mistap on the wrong row is taken back, and the plan's claim goes
   * back to asking for its ingredient — pointing at the row the restore created, at no lot. The
   * capture has to happen before the emptied lot is deleted, or the cascade has already detached
   * the only handle the re-link had.
   */
  test("re-links a plan's claim the undone purchase settled", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const lotId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );
    const claimId = await seedBoughtClaim(t, householdId, ingredientId, lotId, Date.now());

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    await t.run(async (ctx) => {
      const groceryList = await ctx.db.query("groceryListItems").collect();
      expect(groceryList).toHaveLength(1);

      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBe(groceryList[0]!._id);
      expect(claim!.cellarItemId).toBeUndefined();
      expect(claim!.groceryQuantity).toBe(4);
    });
  });

  /**
   * An anchor outlives its purchase — a later buy merges into the same lot — so age is what keeps
   * an older, kept purchase's claim out of the capture. The restore still happens; the claim stays
   * bought.
   */
  test("leaves a claim settled by an older purchase alone", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const lotId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );
    const claimId = await seedBoughtClaim(
      t,
      householdId,
      ingredientId,
      lotId,
      Date.now() - UNDO_WINDOW_MS - 1000,
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    await t.run(async (ctx) => {
      const groceryList = await ctx.db.query("groceryListItems").collect();
      expect(groceryList).toHaveLength(1);

      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBeUndefined();
    });
  });

  /** Nothing is being unmade, so no claim comes back: the claim stays settled by the purchase. */
  test("a removal with no restore re-links nothing", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const lotId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );
    const claimId = await seedBoughtClaim(t, householdId, ingredientId, lotId, Date.now());

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
    });

    await t.run(async (ctx) => {
      const groceryList = await ctx.db.query("groceryListItems").collect();
      expect(groceryList).toHaveLength(0);

      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBeUndefined();
    });
  });

  /**
   * The restore merges into whatever row of the family the list holds, and that row may be in
   * another unit — a kg row the shopper typed while the purchase was in g. The claim's figure is
   * in the unit of the row it names, so it follows the restore by the same ratio the quantity did.
   */
  test("converts a re-linked claim's groceryQuantity when the restore lands on a row in another unit", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, flourId } = await seedHousehold(t);

    const lotId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId: flourId, unit: "g", quantity: 500, updatedAt: Date.now() }),
    );
    const rowId = await t.run((ctx) =>
      ctx.db.insert("groceryListItems", { householdId, ingredientId: flourId, unit: "kg", quantity: 1, updatedAt: Date.now() }),
    );
    const claimId = await seedBoughtClaim(t, householdId, flourId, lotId, Date.now(), { quantity: 500, unit: "g" });

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId: flourId,
      unit: "g",
      quantity: 500,
      restoreToList: 500,
    });

    await t.run(async (ctx) => {
      const groceryList = await ctx.db.query("groceryListItems").collect();
      expect(groceryList).toMatchObject([{ _id: rowId, unit: "kg", quantity: 1.5 }]);

      const claim = await ctx.db.get(claimId);
      expect(claim).toMatchObject({ groceryListItemId: rowId, groceryQuantity: 0.5 });
      expect(claim!.cellarItemId).toBeUndefined();
    });
  });
});

/** The assistant's removeFromCellar tool calls this once per line, and builds its undo from the answer. */
/** Taking back a purchase cancels the `food added to cellar` it made; using food up is not that. */
describe("router/cellars/removeFromCellar reports an undone purchase", () => {
  beforeEach(() => capture.mockReset());

  test("an undo inside the window is reported against the row it took from", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    const cellarItemId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 6, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId, ingredientId, unit: "pcs", quantity: 6, restoreToList: 2, isUndo: true,
    });

    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      {
        distinctId: userId,
        event: "purchase undone",
        groups: { household: householdId },
        properties: { cellarItemId, ingredientId, ingredient: "Egg", category: "EGG" },
      },
    ]);
  });

  test("eggs taken out to cook with report nothing", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 6, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 2 });

    expect(capture).not.toHaveBeenCalled();
  });
});

describe("router/cellars/removeFromCellar._internal", () => {
  test("names the row it took from and what it took", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);
    const rowId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 6, updatedAt: Date.now() }),
    );

    const removed = await t.mutation(internal.router.cellars.removeFromCellar._internal, {
      householdId, ingredientId, unit: "pcs", quantity: 2,
    });

    expect(removed).toEqual({ cellarItemId: rowId, unit: "pcs", removed: 2 });
  });

  /** "Retire 5 oeufs" with 3 in the cellar took 3; an undo that put back 5 would invent 2. */
  test("reports what the row held when it held less than asked", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);
    const rowId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 3, updatedAt: Date.now() }),
    );

    const removed = await t.mutation(internal.router.cellars.removeFromCellar._internal, {
      householdId, ingredientId, unit: "pcs", quantity: 5,
    });

    expect(removed).toEqual({ cellarItemId: rowId, unit: "pcs", removed: 3 });
    expect(await t.run((ctx) => ctx.db.get(rowId))).toBeNull();
  });

  test("takes a kilogram from a row kept in grams, and answers in grams", async () => {
    const t = convexTest(schema, modules);
    const { householdId, flourId } = await seedHousehold(t);
    const rowId = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId: flourId, unit: "g", quantity: 1500, updatedAt: Date.now() }),
    );

    const removed = await t.mutation(internal.router.cellars.removeFromCellar._internal, {
      householdId, ingredientId: flourId, unit: "kg", quantity: 1,
    });

    expect(removed).toEqual({ cellarItemId: rowId, unit: "g", removed: 1000 });
    expect((await t.run((ctx) => ctx.db.get(rowId)))?.quantity).toBe(500);
  });

  test("a row in the asked unit wins over one that needs converting", async () => {
    const t = convexTest(schema, modules);
    const { householdId, flourId } = await seedHousehold(t);
    const [gramsId, kilosId] = await t.run(async (ctx) => [
      await ctx.db.insert("cellarItems", { householdId, ingredientId: flourId, unit: "g", quantity: 800, updatedAt: Date.now() + 1 }),
      await ctx.db.insert("cellarItems", { householdId, ingredientId: flourId, unit: "kg", quantity: 2, updatedAt: Date.now() }),
    ]);

    await t.mutation(internal.router.cellars.removeFromCellar._internal, {
      householdId, ingredientId: flourId, unit: "kg", quantity: 1,
    });

    expect((await t.run((ctx) => ctx.db.get(kilosId)))?.quantity).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(gramsId)))?.quantity).toBe(800);
  });

  /** Grams against pieces needs a piece weight: nothing is guessed, and the model is told what is there. */
  test("grams asked of a row kept in pieces throws, naming what the cellar holds", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);
    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await expect(
      t.mutation(internal.router.cellars.removeFromCellar._internal, { householdId, ingredientId, unit: "g", quantity: 100 }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT", message: expect.stringMatching(/The cellar holds: 4 pcs/) } });

    const [row] = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(row?.quantity).toBe(4);
  });

  /**
   * The cellar is often behind the kitchen, so "none of it here" is an ordinary answer, not a unit
   * problem: a different code lets the assistant pass over it rather than ask the cook a question.
   */
  test("none of the food on the shelf is NOT_FOUND, told apart from a unit it cannot convert", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(internal.router.cellars.removeFromCellar._internal, { householdId, ingredientId, unit: "pcs", quantity: 2 }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});
