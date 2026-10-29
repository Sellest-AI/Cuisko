import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

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
      .filter(([path]) => path.startsWith("/convex/router/recipes/setFavorite."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

/** `userId` optional so a catalog recipe — one nobody wrote — can be seeded the same way. */
const seedRecipe = (userId?: Id<"users">) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { en: "Onion soup", fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      servings: 4,
      difficulty: 2,
      userId,
    }),
  );

/**
 * `t.run` hands back a ctx over the GENERIC data model, so `withIndex` has no index to name here and
 * this filters in memory — see `router/planning/__tests__/setServings.test.ts`. Fine over a fixture
 * of a few rows, and not a pattern to copy into `functions/`.
 */
const favoritesOf = (userId: Id<"users">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("recipeFavorites").collect();
    return rows.filter((row) => row.userId === userId);
  });

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/setFavorite", () => {
  test("rejects an unauthenticated caller", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true }),
    ).rejects.toThrow();
  });

  test("refuses a recipe that does not exist", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(
      t
        .withIdentity(asUser(userId))
        .mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true }),
    ).rejects.toThrow();
    expect(await favoritesOf(userId)).toEqual([]);
  });

  /** The shelf is for recipes that are not the caller's to edit — catalog ones first of all. */
  test("keeps a catalog recipe, which nobody owns", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe();

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true });

    expect(await favoritesOf(userId)).toMatchObject([{ userId, recipeId }]);
  });

  test("keeps another cook's recipe", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    await t
      .withIdentity(asUser(strangerId))
      .mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true });

    expect(await favoritesOf(strangerId)).toMatchObject([{ userId: strangerId, recipeId }]);
    /** The owner's shelf is untouched: a favorite belongs to whoever kept it. */
    expect(await favoritesOf(ownerId)).toEqual([]);
  });

  /**
   * Two taps before the payload catches up both send `true`. A set converges; a toggle would have
   * unfavorited the recipe on the second tap.
   */
  test("keeping twice leaves one row, the first one", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    const caller = t.withIdentity(asUser(userId));

    await caller.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true });
    const [first] = await favoritesOf(userId);
    await caller.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true });

    const rows = await favoritesOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(first._id);
  });

  test("keeping then releasing leaves nothing", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    const caller = t.withIdentity(asUser(userId));

    await caller.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true });
    await caller.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: false });

    expect(await favoritesOf(userId)).toEqual([]);
  });

  /** A race that ever left two rows is healed by the next write, whichever way it goes. */
  test("releasing removes every duplicate at once", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("recipeFavorites", { userId, recipeId });
      await ctx.db.insert("recipeFavorites", { userId, recipeId });
    });

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: false });

    expect(await favoritesOf(userId)).toEqual([]);
  });

  test("echoes the state it ensured", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    const caller = t.withIdentity(asUser(userId));

    await expect(
      caller.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: true }),
    ).resolves.toEqual({ liked: true });
    await expect(
      caller.mutation(api.router.recipes.setFavorite.authed, { id: recipeId, liked: false }),
    ).resolves.toEqual({ liked: false });
  });
});
