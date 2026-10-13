import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api, internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/cellars/addToCellar."))
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
      shelfLifeDays: 21,
      openedShelfLifeDays: 2,
      nutrition: { calories: 70, protein: 6, fat: 5, carbohydrates: 0 },
      updatedAt: Date.now(),
    });

    return { userId, householdId, ingredientId };
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

describe("router/cellars/addToCellar", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 }),
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
        .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 }),
    ).rejects.toThrow();
  });

  test("creates a new cellar item when none matches", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const id = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!._id).toBe(id);
    expect(items[0]!.quantity).toBe(4);
  });

  test("merges into an existing item of the same ingredient and unit instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 3, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(7);
  });

  test("clears the matching recently-used entry once the ingredient is back in the cellar", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("recentlyUsedIngredients", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 2,
        updatedAt: Date.now(),
      }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);
  });

  /**
   * The claim the week's commit wrote: 4 eggs missing, bought into the lot the purchase created.
   * The ledger stops naming the list row and names the lot instead — the state the undo reads.
   */
  test("re-anchors a plan's claim when the purchase strikes its grocery row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { groceryRowId, claimId } = await t.run(async (ctx) => {
      const groceryRowId = await ctx.db.insert("groceryListItems", {
        householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now(),
      });
      const claimId = await ctx.db.insert("plannedMealIngredients", {
        plannedMealId,
        ingredientId,
        sourceQuantity: 4,
        sourceUnit: "pcs",
        quantity: 4,
        unit: "pcs",
        groceryQuantity: 4,
        groceryListItemId: groceryRowId,
        updatedAt: Date.now(),
      });

      return { groceryRowId, claimId };
    });

    const cellarItemId = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(groceryRowId)).toBeNull();

      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBeUndefined();
      expect(claim!.cellarItemId).toBe(cellarItemId);
      expect(claim!.groceryQuantity).toBe(4);
    });
  });

  /**
   * The claim reserved against the first lot at commit time; the purchase merges into a second
   * lot that already existed. The reservation stands — the purchase only settles the missing part.
   */
  test("keeps a claim's own reservation when the purchase lands on another lot", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { claimId, reservedLotId } = await t.run(async (ctx) => {
      // Inserted first, so the purchase merges into it; the claim's reservation is the other lot.
      await ctx.db.insert("cellarItems", {
        householdId, ingredientId, unit: "pcs", quantity: 1, updatedAt: Date.now(),
      });
      const reservedLotId = await ctx.db.insert("cellarItems", {
        householdId, ingredientId, unit: "pcs", quantity: 250, updatedAt: Date.now(),
      });
      const groceryRowId = await ctx.db.insert("groceryListItems", {
        householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now(),
      });
      const claimId = await ctx.db.insert("plannedMealIngredients", {
        plannedMealId,
        ingredientId,
        sourceQuantity: 4,
        sourceUnit: "pcs",
        quantity: 4,
        unit: "pcs",
        groceryQuantity: 4,
        groceryListItemId: groceryRowId,
        cellarItemId: reservedLotId,
        updatedAt: Date.now(),
      });

      return { claimId, reservedLotId };
    });

    const landedOn = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });
    expect(landedOn).not.toBe(reservedLotId);

    await t.run(async (ctx) => {
      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBeUndefined();
      expect(claim!.cellarItemId).toBe(reservedLotId);

      const boughtLot = await ctx.db.get(landedOn);
      expect(boughtLot!.quantity).toBe(5);
    });
  });

  /** A row only decremented keeps its identity, and with it the claims still pointing at it. */
  test("a row only partly struck keeps the claim's pointer", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { groceryRowId, claimId } = await t.run(async (ctx) => {
      const groceryRowId = await ctx.db.insert("groceryListItems", {
        householdId, ingredientId, unit: "pcs", quantity: 10, updatedAt: Date.now(),
      });
      const claimId = await ctx.db.insert("plannedMealIngredients", {
        plannedMealId,
        ingredientId,
        sourceQuantity: 4,
        sourceUnit: "pcs",
        quantity: 4,
        unit: "pcs",
        groceryQuantity: 4,
        groceryListItemId: groceryRowId,
        updatedAt: Date.now(),
      });

      return { groceryRowId, claimId };
    });

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    await t.run(async (ctx) => {
      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBe(groceryRowId);
      expect(claim!.cellarItemId).toBeUndefined();
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe("router/cellars/addToCellar expiration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Moves the clock to `day` days after the epoch, which is what every date below counts from. */
  const onDay = (day: number) => vi.setSystemTime(day * DAY_MS);

  const setup = async (shelfLifeDays: number | undefined) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    onDay(0);

    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    await t.run((ctx) => ctx.db.patch(ingredientId, { shelfLifeDays }));

    const buy = (quantity: number) =>
      t
        .withIdentity(asUser(userId))
        .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity });
    const rowDay = async () => {
      const [row] = await t.run((ctx) => ctx.db.query("cellarItems").collect());

      return row!.expirationDate === undefined ? undefined : row!.expirationDate / DAY_MS;
    };
    const seedRow = (row: { quantity: number; expirationDate?: number }) =>
      t.run((ctx) =>
        ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", ...row, updatedAt: Date.now() }),
      );

    return { t, householdId, ingredientId, buy, rowDay, seedRow };
  };

  test("dates a new row from the ingredient's shelf life", async () => {
    const { buy, rowDay } = await setup(21);

    onDay(3);
    await buy(6);

    expect(await rowDay()).toBe(24);
  });

  test("leaves a new row undated when nothing estimated the ingredient's shelf life", async () => {
    const { buy, rowDay } = await setup(undefined);

    await buy(6);

    expect(await rowDay()).toBeUndefined();
  });

  test("dates the row when the purchase strikes a grocery line, too", async () => {
    const { t, householdId, ingredientId, buy, rowDay } = await setup(21);
    await t.run((ctx) =>
      ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "pcs", quantity: 6, updatedAt: Date.now() }),
    );

    await buy(6);

    expect(await t.run((ctx) => ctx.db.query("groceryListItems").collect())).toEqual([]);
    expect(await rowDay()).toBe(21);
  });

  /**
   * The case the merge rule was agreed on: milk at 90 days, nothing drunk in between. A merge keeps
   * the older date while the older stock is a real share of the row, and takes the new one once
   * that stock is stale by time or swamped by quantity.
   */
  test("merges milk bought over three months", async () => {
    const { buy, rowDay } = await setup(90);

    await buy(4);
    expect(await rowDay()).toBe(90);

    // 60 days left is more than a third, and 1 is less than 3 × 4.
    onDay(30);
    await buy(1);
    expect(await rowDay()).toBe(90);

    // 30 days left is a third: the first four are taken as drunk.
    onDay(60);
    await buy(1);
    expect(await rowDay()).toBe(150);

    // 60 days left, but 20 is at least 3 × 6: what is on the shelf is mostly the new milk.
    onDay(90);
    await buy(20);
    expect(await rowDay()).toBe(180);
  });

  test("a row that has run out takes the new date", async () => {
    const { buy, rowDay, seedRow } = await setup(21);
    await seedRow({ quantity: 0, expirationDate: 20 * DAY_MS });

    await buy(1);

    expect(await rowDay()).toBe(21);
  });

  test("an undated row takes the new date", async () => {
    const { buy, rowDay, seedRow } = await setup(21);
    await seedRow({ quantity: 6 });

    await buy(1);

    expect(await rowDay()).toBe(21);
  });

  test("an expired row takes the new date", async () => {
    const { buy, rowDay, seedRow } = await setup(21);
    onDay(30);
    await seedRow({ quantity: 6, expirationDate: 25 * DAY_MS });

    await buy(1);

    expect(await rowDay()).toBe(51);
  });

  test("a merge leaves a dated row alone when the ingredient has no shelf life", async () => {
    const { buy, rowDay, seedRow } = await setup(undefined);
    await seedRow({ quantity: 1, expirationDate: 5 * DAY_MS });

    await buy(10);

    expect(await rowDay()).toBe(5);
  });
});

/** A grocery line wanting `quantity` eggs, as the cook wrote it. */
const seedListLine = (t: ReturnType<typeof convexTest>, householdId: Id<"households">, ingredientId: Id<"ingredients">, quantity: number) =>
  t.run((ctx) => ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "pcs", quantity, updatedAt: Date.now() }));

/**
 * What the assistant's undo of an add gives back to the list is what the add struck, and the add is
 * the only moment it can be known: the lines it strikes are deleted.
 */
describe("router/cellars/addToCellar._internal", () => {
  test("reports the row it landed on and what it struck off the list", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    await seedListLine(t, householdId, ingredientId, 2);

    const added = await t.mutation(internal.router.cellars.addToCellar._internal, {
      householdId, actor: userId, ingredientId, unit: "pcs", quantity: 6,
    });

    const [row] = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(added).toEqual({ cellarItemId: row!._id, struck: 2 });
  });

  test("a purchase nobody wrote down struck nothing", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const added = await t.mutation(internal.router.cellars.addToCellar._internal, {
      householdId, actor: userId, ingredientId, unit: "pcs", quantity: 6,
    });

    expect(added.struck).toBe(0);
  });

  test("a purchase smaller than the line struck all of itself", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    await seedListLine(t, householdId, ingredientId, 10);

    const added = await t.mutation(internal.router.cellars.addToCellar._internal, {
      householdId, actor: userId, ingredientId, unit: "pcs", quantity: 4,
    });

    expect(added.struck).toBe(4);
  });
});

/**
 * The undo of a removal puts the stock back without buying anything: "retire 2 oeufs" then Annuler
 * must leave the 2 eggs the cook still wants on the list.
 */
describe("router/cellars/addToCellar strikeList", () => {
  test("false puts the stock back and leaves the grocery list alone", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    const lineId = await seedListLine(t, householdId, ingredientId, 2);

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 3, strikeList: false });

    expect((await t.run((ctx) => ctx.db.get(lineId)))?.quantity).toBe(2);
    const [row] = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(row?.quantity).toBe(3);
  });
});

/** Shopping from the list against shopping beside it: the list is only short if it is used. */
describe("router/cellars/addToCellar reports the purchase", () => {
  beforeEach(() => capture.mockReset());

  test("6 eggs bought against lines of 2 and 3: both lines ticked off, under the cook", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    await seedListLine(t, householdId, ingredientId, 2);
    await seedListLine(t, householdId, ingredientId, 3);

    const cellarItemId = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 6 });

    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      {
        distinctId: userId,
        event: "food added to cellar",
        groups: { household: householdId },
        properties: { cellarItemId, ingredientId, ingredient: "Egg", category: "EGG", struckLines: 2 },
      },
    ]);
  });

  test("a purchase nobody wrote down ticked off no line", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.mutation(internal.router.cellars.addToCellar._internal, {
      householdId, actor: userId, ingredientId, unit: "pcs", quantity: 6,
    });

    expect(capture.mock.calls[0]![1]).toMatchObject({ distinctId: userId, properties: { struckLines: 0 } });
  });

  /** Nobody bought anything: the stock is going back where it was. */
  test("an undo of a removal reports nothing", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 3, strikeList: false });

    expect(capture).not.toHaveBeenCalled();
  });
});
