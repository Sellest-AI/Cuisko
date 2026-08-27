import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/** The whole first page, which is more than any test here seeds. */
const FIRST_PAGE = { paginationOpts: { numItems: 50, cursor: null }, locale: "en" as const };

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

const seedRecipe = (
  userId: Id<"users">,
  title: string,
  overrides: { timings?: { preparation?: number; cooking?: number; resting?: number } } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: { values: { en: title, fr: `${title} (fr)` }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 2,
      userId,
      tags: [],
      cuisine: "italian",
      timings: overrides.timings ?? { preparation: 10, cooking: 20 },
      search: { en: "", fr: "" },
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

describe("router/recipes/getAll", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(t.query(api.router.recipes.getAll.authed, FIRST_PAGE)).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t.withIdentity(asUser(ghost)).query(api.router.recipes.getAll.authed, FIRST_PAGE),
    ).rejects.toThrow();
  });

  /**
   * The claim the screen is built on. `getAll` takes no `userId`, so the only way another cook's
   * recipe could appear is the index being read against the wrong owner — which is exactly what a
   * seeded second user catches and a single-user fixture never would.
   */
  test("returns the caller's recipes and nobody else's", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(userId, "Mine");
    await seedRecipe(strangerId, "Theirs");

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getAll.authed, FIRST_PAGE);

    expect(page.map((recipe) => recipe.title)).toEqual(["Mine"]);
  });

  test("answers in the locale it was asked in", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "Lasagna");

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getAll.authed, { ...FIRST_PAGE, locale: "fr" });

    expect(page[0]!.title).toBe("Lasagna (fr)");
  });

  test("puts the recipe just written at the top", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "First");
    await seedRecipe(userId, "Second");
    await seedRecipe(userId, "Third");

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getAll.authed, FIRST_PAGE);

    expect(page.map((recipe) => recipe.title)).toEqual(["Third", "Second", "First"]);
  });

  test("walks the whole list across pages without repeating or dropping a recipe", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "First");
    await seedRecipe(userId, "Second");
    await seedRecipe(userId, "Third");

    const caller = t.withIdentity(asUser(userId));
    const first = await caller.query(api.router.recipes.getAll.authed, {
      paginationOpts: { numItems: 2, cursor: null },
      locale: "en",
    });

    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);

    const second = await caller.query(api.router.recipes.getAll.authed, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
      locale: "en",
    });

    expect([...first.page, ...second.page].map((recipe) => recipe.title)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });

  /**
   * The card's own contract, asserted through the route because that is where it is consumed:
   * the three timings arrive as one number, and a recipe that declares none arrives without one
   * rather than claiming to be instant.
   */
  test("adds the timings up, and reports none rather than zero", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "Timed", { timings: { preparation: 10, cooking: 20, resting: 5 } });
    await seedRecipe(userId, "Untimed", { timings: {} });

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getAll.authed, FIRST_PAGE);

    const byTitle = Object.fromEntries(page.map((recipe) => [recipe.title, recipe.minutes]));

    expect(byTitle["Timed"]).toBe(35);
    expect(byTitle["Untimed"]).toBeUndefined();
  });

  /** The document stops at the mapper: a page carrying `search` would ship both locales of it. */
  test("hands out cards rather than documents", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, "Lasagna");

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getAll.authed, FIRST_PAGE);

    expect(Object.keys(page[0]!).sort()).toEqual(["cuisine", "id", "minutes", "title"]);
  });
});
