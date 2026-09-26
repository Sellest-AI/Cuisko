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
      .filter(([path]) => path.startsWith("/convex/router/recipes/archiveOne."))
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
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { en: "Onion soup", fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      userId,
      tags: [],
      cuisine: "french",
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

const rowOf = (recipeId: Id<"recipes">) => t.run((ctx) => ctx.db.get(recipeId));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/archiveOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(t.mutation(api.router.recipes.archiveOne.authed, { id: recipeId })).rejects.toThrow();
    expect((await rowOf(recipeId))?.isArchived).toBe(false);
  });

  /** Reading another cook's recipe is open (ADR 0014); deleting it is not. */
  test("refuses another cook's recipe", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    await expect(
      t.withIdentity(asUser(strangerId)).mutation(api.router.recipes.archiveOne.authed, { id: recipeId }),
    ).rejects.toThrow(/FORBIDDEN/);
    expect((await rowOf(recipeId))?.isArchived).toBe(false);
  });

  /** Nobody owns the catalog, so no cook can delete from it; its removal is `deleteOne._internal`. */
  test("refuses a catalog recipe", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe();

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.recipes.archiveOne.authed, { id: recipeId }),
    ).rejects.toThrow(/FORBIDDEN/);
    expect((await rowOf(recipeId))?.isArchived).toBe(false);
  });

  /** Archived, and nothing else: the row is what last week's dinner still opens. */
  test("archives the owner's recipe and keeps the row", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t.withIdentity(asUser(userId)).mutation(api.router.recipes.archiveOne.authed, { id: recipeId });

    expect(await rowOf(recipeId)).toMatchObject({ isArchived: true, status: "generated" });
  });

  test("leaves an already archived recipe untouched", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await t.run((ctx) => ctx.db.patch(recipeId, { isArchived: true, updatedAt: 1 }));

    await t.withIdentity(asUser(userId)).mutation(api.router.recipes.archiveOne.authed, { id: recipeId });

    expect(await rowOf(recipeId)).toMatchObject({ isArchived: true, updatedAt: 1 });
  });
});
