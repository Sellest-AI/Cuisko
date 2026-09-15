import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

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
      .filter(([path]) => path.startsWith("/convex/router/recipes/search."))
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

/** A literal blob, for the reason `functions/recipes/__tests__/searchForUser.test.ts` gives. */
const seedRecipe = (userId: Id<"users">, title: string, search = "") =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: { values: { en: title, fr: title }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 2,
      userId,
      tags: [],
      cuisine: "italian",
      timings: {},
      search: { en: search, fr: search },
      isVegan: false,
      isVegetarian: false,
      isPescatarian: false,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    }),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/search", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(
      t.query(api.router.recipes.search.authed, { query: "tomato", locale: "en" }),
    ).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t
        .withIdentity(asUser(ghost))
        .query(api.router.recipes.search.authed, { query: "tomato", locale: "en" }),
    ).rejects.toThrow();
  });

  /**
   * The catalog is shared (ADR 0014): another cook's recipe is an answer, ranked after the
   * caller's own. The ranking itself is pinned in `functions/recipes/__tests__/searchForUser.test.ts`;
   * this only pins that the route reaches past the caller.
   */
  test("returns another cook's matching recipe, after the caller's own", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(strangerId, "Tomato soup", "tomato");
    await seedRecipe(userId, "Bean stew", "tomato beans");

    const found = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.search.authed, { query: "tomato", locale: "en" });

    expect(found.map((recipe) => recipe.title)).toEqual(["Bean stew", "Tomato soup"]);
  });

  test("returns the caller's own match", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "Tomato soup", "tomato onion");

    const found = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.search.authed, { query: "tomato", locale: "en" });

    expect(found.map((recipe) => recipe.title)).toEqual(["Tomato soup"]);
  });

  /** A match is drawn by the same card as the list, so it carries the same cover. */
  test("carries the match's cover url", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId, "Tomato soup", "tomato");

    await t.run(async (ctx) => {
      const coverImageId = await ctx.db.insert("images", {
        hasAlpha: false,
        key: "public/cover.webp",
        url: "cover.webp",
        width: 600,
        height: 400,
        size: 6_000,
        mimeType: "image/webp",
        tags: ["IMAGE"],
        updatedAt: Date.now(),
      });
      await ctx.db.patch(recipeId, { coverImageId });
    });

    const found = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.search.authed, { query: "tomato", locale: "en" });

    expect(found[0]?.coverImageUrl).toBe("cover.webp");
  });
});
