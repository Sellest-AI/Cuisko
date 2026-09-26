import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Warms the module under test before anything is timed — C10 rule 4. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/getMany."))
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

const seedRecipe = (userId: Id<"users">, title: string) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
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

describe("router/recipes/getMany", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(
      t.query(api.router.recipes.getMany.authed, { ids: [], locale: "en" }),
    ).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t
        .withIdentity(asUser(ghost))
        .query(api.router.recipes.getMany.authed, { ids: [], locale: "en" }),
    ).rejects.toThrow();
  });

  /**
   * The order is the caller's argument order, not the table's. The ids arrive from the assistant
   * already ranked by `searchForUser`, and reading them back in document order would throw that
   * ranking away silently — the cards would stop agreeing with the sentence above them.
   */
  test("returns the cards in the order the ids were given", async () => {
    const userId = await seedUser("Franck");
    const first = await seedRecipe(userId, "Bolognaise");
    const second = await seedRecipe(userId, "Carbonara");

    const cards = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getMany.authed, { ids: [second, first], locale: "en" });

    expect(cards.map((card) => card.title)).toEqual(["Carbonara", "Bolognaise"]);
  });

  /**
   * A recipe is readable by any signed-in cook (ADR 0014), so ids the caller did not write are the
   * normal case here rather than an attack — the assistant's cards come out of a shared catalog.
   */
  test("returns another cook's recipe", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const theirs = await seedRecipe(strangerId, "Tomato soup");

    const cards = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getMany.authed, { ids: [theirs], locale: "en" });

    expect(cards.map((card) => card.title)).toEqual(["Tomato soup"]);
  });

  /**
   * `ids` comes from a client, and each one costs a document read plus up to two image reads. The
   * agent's tool asks for five, but nothing in this signature stops a caller asking for thousands
   * — so the bound is enforced here rather than trusted to the honest caller.
   */
  test("resolves at most MAX_CARDS, however many ids are passed", async () => {
    const userId = await seedUser("Franck");
    const ids = [];
    for (let index = 0; index < 20; index++) ids.push(await seedRecipe(userId, `Recipe ${index}`));

    const cards = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getMany.authed, { ids, locale: "en" });

    expect(cards).toHaveLength(16);
    expect(cards[0]?.title).toBe("Recipe 0");
  });

  /**
   * Ids reach here off a tool result stored in a message, so a recipe deleted since that
   * conversation is ordinary. One card fewer beats a transcript that throws.
   */
  test("drops an id whose recipe is gone, rather than failing", async () => {
    const userId = await seedUser("Franck");
    const kept = await seedRecipe(userId, "Bolognaise");
    const deleted = await seedRecipe(userId, "Gone");
    await t.run((ctx) => ctx.db.delete(deleted));

    const cards = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getMany.authed, { ids: [deleted, kept], locale: "en" });

    expect(cards.map((card) => card.title)).toEqual(["Bolognaise"]);
  });
});
