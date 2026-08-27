import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

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
   * The claim that matters for a search route specifically. `getAll` can only leak a whole list,
   * which is obvious; a search leaks one row at a time, to whoever guesses a word in it — so the
   * stranger's recipe below is one the term matches, and the correct answer is still nothing.
   */
  test("does not return another cook's matching recipe", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(strangerId, "Tomato soup", "tomato");
    await seedRecipe(userId, "Bean stew", "beans");

    const found = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.search.authed, { query: "tomato", locale: "en" });

    expect(found).toEqual([]);
  });

  test("returns the caller's own match", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "Tomato soup", "tomato onion");

    const found = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.search.authed, { query: "tomato", locale: "en" });

    expect(found.map((recipe) => recipe.title)).toEqual(["Tomato soup"]);
  });
});
