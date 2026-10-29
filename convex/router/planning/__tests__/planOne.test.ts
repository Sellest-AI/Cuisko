import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import type { Id } from "../../../_generated/dataModel";
import { api, internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see commit.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/planOne."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

let t: ReturnType<typeof convexTest>;

/**
 * `commit` books a skip job for every plate it writes (`skipAt`), and with `TODAY` in 2023 every
 * one of them is already due: left on a real timer it fires a few ms into the test and closes the
 * plate under the assertion — only under load, and never when the file runs alone. Only the timer
 * functions are faked, so `Date.now()` stays real for the `updatedAt` columns the seeds write, and
 * the pending timers are dropped after each test rather than run; `skipOne.test.ts` runs the job.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
  capture.mockReset();
});

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const seedMember = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", { name: "Home", inviteCode: "ABC123", updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });
    return { userId, householdId };
  });

/** A recipe of one 200 g line of its own ingredient, written for two, owned by the catalog when `userId` is left out. */
const seedRecipe = (title: string, userId?: Id<"users">) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: title }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await insertTestRecipe(ctx.db, {
      userId,
      title: { values: { fr: title }, meta: {} },
      timings: { cooking: 20 },
      shuffleKey: 1_000,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 200,
      unit: "g",
      updatedAt: Date.now(),
    });
    return { recipeId, ingredientId };
  });

const planOne = (
  userId: Id<"users">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { date = TODAY + DAY, servings = 2 }: { date?: number; servings?: number } = {},
) =>
  t.withIdentity(asUser(userId)).mutation(api.router.planning.planOne.authed, {
    householdId, recipeId, date, slot: "lunch", servings, today: TODAY,
  });

const platesOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("plannedMeals").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const listOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("groceryListItems").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const plansOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("mealPlans").collect();
    return rows.filter((plan) => plan.householdId === householdId);
  });

describe("router/planning/planOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(
      t.mutation(api.router.planning.planOne.authed, {
        householdId, recipeId, date: TODAY + DAY, slot: "lunch", servings: 2, today: TODAY,
      }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    const { recipeId } = await seedRecipe("Soupe");

    await expect(planOne(outsiderId, householdId, recipeId)).rejects.toThrow();
    expect(await platesOf(householdId)).toEqual([]);
  });

  /** The catalog is shared (ADR 0014): another cook's recipe lands on the plate like any other. */
  test("plans another cook's recipe", async () => {
    const { userId, householdId } = await seedMember();
    const elsewhere = await seedMember();
    const { recipeId } = await seedRecipe("Shared", elsewhere.userId);

    await planOne(userId, householdId, recipeId);

    expect(await platesOf(householdId)).toMatchObject([{ recipeId }]);
  });

  /** A plan of one plate, with no shuffle behind it, and the missing 200 g on the list. */
  test("writes the plate, a seedless plan and its groceries", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");

    const mealPlanId = await planOne(userId, householdId, recipeId, { date: TODAY, servings: 4 });

    expect(await plansOf(householdId)).toMatchObject([{ _id: mealPlanId, people: 4, days: 1, slots: ["lunch"] }]);
    expect((await plansOf(householdId))[0]!.seed).toBeUndefined();
    expect(await platesOf(householdId)).toMatchObject([{ mealPlanId, recipeId, date: TODAY, slot: "lunch", servings: 4 }]);
    // Written for two, cooked for four: the line doubles.
    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 400, unit: "g" }]);
  });

  test("replaces the plate already on that day and slot, and its claims with it", async () => {
    const { userId, householdId } = await seedMember();
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");

    await planOne(userId, householdId, first.recipeId);
    await planOne(userId, householdId, second.recipeId);

    expect(await platesOf(householdId)).toMatchObject([{ recipeId: second.recipeId }]);
    expect(await plansOf(householdId)).toHaveLength(1);
    expect(await listOf(householdId)).toMatchObject([{ ingredientId: second.ingredientId, quantity: 200 }]);
  });

  test("leaves the other slot of that day alone", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await t.withIdentity(asUser(userId)).mutation(api.router.planning.planOne.authed, {
      householdId, recipeId, date: TODAY + DAY, slot: "dinner", servings: 2, today: TODAY,
    });
    await planOne(userId, householdId, recipeId);

    expect((await platesOf(householdId)).map((plate) => plate.slot).sort()).toEqual(["dinner", "lunch"]);
  });

  test("refuses to replace a plate that has been cooked", async () => {
    const { userId, householdId } = await seedMember();
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");

    await planOne(userId, householdId, first.recipeId);
    const [cooked] = await platesOf(householdId);
    await t.run((ctx) => ctx.db.patch(cooked!._id, { status: "cooked", updatedAt: Date.now() }));

    await expect(planOne(userId, householdId, second.recipeId)).rejects.toThrow();
    expect(await platesOf(householdId)).toMatchObject([{ recipeId: first.recipeId, status: "cooked" }]);
  });

  test("refuses a day that has passed", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(planOne(userId, householdId, recipeId, { date: TODAY - DAY })).rejects.toThrow();
    expect(await platesOf(householdId)).toEqual([]);
  });

  test("refuses a plate for nobody", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(planOne(userId, householdId, recipeId, { servings: 0 })).rejects.toThrow();
  });
});

/** Cuisko's way in: the chat's undo drops the plate by its id, and puts back what it replaced. */
describe("router/planning/planOne _internal", () => {
  const planInternal = (actor: Id<"users">, householdId: Id<"households">, recipeId: Id<"recipes">, servings = 2) =>
    t.mutation(internal.router.planning.planOne._internal, {
      householdId, actor, recipeId, date: TODAY + DAY, slot: "dinner", servings, today: TODAY,
    });

  test("returns the plate it wrote, and nothing replaced on an empty slot", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Lasagnes");

    const planned = await planInternal(userId, householdId, recipeId, 4);

    const [plate] = await platesOf(householdId);
    expect(planned).toEqual({ mealPlanId: plate!.mealPlanId, plannedMealId: plate!._id });
    expect(plate).toMatchObject({ recipeId, slot: "dinner", servings: 4 });
  });

  test("returns the planned plate it replaced, with its recipe and servings", async () => {
    const { userId, householdId } = await seedMember();
    const curry = await seedRecipe("Curry");
    const lasagne = await seedRecipe("Lasagnes");

    await planInternal(userId, householdId, curry.recipeId, 3);
    const planned = await planInternal(userId, householdId, lasagne.recipeId, 4);

    expect(planned.replaced).toEqual({ recipeId: curry.recipeId, servings: 3 });
    expect(await platesOf(householdId)).toMatchObject([{ _id: planned.plannedMealId, recipeId: lasagne.recipeId }]);
  });

  test("leaves the other slot's plate out of what it replaced", async () => {
    const { userId, householdId } = await seedMember();
    const curry = await seedRecipe("Curry");
    const lasagne = await seedRecipe("Lasagnes");

    // Lunch that day, planned from the screen; Cuisko plans dinner.
    await planOne(userId, householdId, curry.recipeId);
    const planned = await planInternal(userId, householdId, lasagne.recipeId);

    expect(planned.replaced).toBeUndefined();
    expect(await platesOf(householdId)).toHaveLength(2);
  });

  /** No shuffle drew it, so it is a plate, not a week; and it is the cook's, though Cuisko wrote it. */
  test("reports a plate planned, under the cook whose turn it was", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Lasagnes");

    await planInternal(userId, householdId, recipeId, 4);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]![1]).toMatchObject({
      distinctId: userId,
      event: "plate planned",
      groups: { household: householdId },
      properties: { plates: 1, days: 1, people: 4, lines: 1, replaced: 0, recipeId, recipeOrigin: "catalog", isUndo: false },
    });
  });
});

/** The chat's undo puts back the dish Cuisko replaced: a real plate, reported, but told apart. */
describe("router/planning/planOne reports an undo", () => {
  test("a plate put back by an undo is reported with isUndo, an ordinary one without", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Curry");

    await planOne(userId, householdId, recipeId);
    await t.withIdentity(asUser(userId)).mutation(api.router.planning.planOne.authed, {
      householdId, recipeId, date: TODAY + 2 * DAY, slot: "lunch", servings: 2, today: TODAY, isUndo: true,
    });

    expect(capture.mock.calls.map(([, args]) => args.properties.isUndo)).toEqual([false, true]);
  });
});
