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
      .filter(([path]) => path.startsWith("/convex/router/recipes/getFavorites."))
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

const seedRecipe = (userId: Id<"users"> | undefined, title: string) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { en: title, fr: `${title} (fr)` }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      difficulty: 2,
      userId,
      cuisine: "italian",
    }),
  );

const seedFavorite = (userId: Id<"users">, recipeId: Id<"recipes">) =>
  t.run((ctx) => ctx.db.insert("recipeFavorites", { userId, recipeId }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/getFavorites", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(t.query(api.router.recipes.getFavorites.authed, { locale: "en" })).rejects.toThrow();
  });

  test("answers with nothing before any favorite", async () => {
    const userId = await seedUser("Franck");

    const favorites = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getFavorites.authed, { locale: "en" });

    expect(favorites).toEqual([]);
  });

  /** Ordered by when it was kept, not by when it was written: an old recipe is a new favorite. */
  test("gives the caller's favorites, newest favorite first, whoever wrote them", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const own = await seedRecipe(userId, "Own");
    const foreign = await seedRecipe(strangerId, "Foreign");
    const catalog = await seedRecipe(undefined, "Catalog");
    await seedFavorite(userId, foreign);
    await seedFavorite(userId, own);
    await seedFavorite(userId, catalog);

    const favorites = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getFavorites.authed, { locale: "en" });

    expect(favorites.map(({ title }) => title)).toEqual(["Catalog", "Own", "Foreign"]);
  });

  test("never gives another cook's favorites", async () => {
    const userId = await seedUser("Franck");
    const otherId = await seedUser("Other");
    const recipeId = await seedRecipe(userId, "Kept by the other");
    await seedFavorite(otherId, recipeId);

    const favorites = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getFavorites.authed, { locale: "en" });

    expect(favorites).toEqual([]);
  });

  test("answers in the locale it was asked in", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId, "Onion soup");
    await seedFavorite(userId, recipeId);

    const favorites = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getFavorites.authed, { locale: "fr" });

    expect(favorites.map(({ title }) => title)).toEqual(["Onion soup (fr)"]);
  });

  /** The cascade should make this unreachable; the shelf drops the row rather than failing. */
  /** Deleted by the cook who wrote it: off this cook's shelf, though the row that kept it stays. */
  test("skips a favorite whose recipe was archived", async () => {
    const authorId = await seedUser("Author");
    const userId = await seedUser("Franck");
    const kept = await seedRecipe(authorId, "Kept");
    const archived = await seedRecipe(authorId, "Archived");
    await seedFavorite(userId, archived);
    await seedFavorite(userId, kept);
    await t.run((ctx) => ctx.db.patch(archived, { isArchived: true }));

    const favorites = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getFavorites.authed, { locale: "en" });

    expect(favorites.map(({ title }) => title)).toEqual(["Kept"]);
  });

  test("skips a favorite whose recipe is gone", async () => {
    const userId = await seedUser("Franck");
    const kept = await seedRecipe(userId, "Kept");
    const gone = await seedRecipe(userId, "Gone");
    await seedFavorite(userId, gone);
    await seedFavorite(userId, kept);
    await t.run((ctx) => ctx.db.delete(gone));

    const favorites = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getFavorites.authed, { locale: "en" });

    expect(favorites.map(({ title }) => title)).toEqual(["Kept"]);
  });
});
