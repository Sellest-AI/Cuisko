import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
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
      .filter(([path]) => path.startsWith("/convex/router/recipes/recordShare."))
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

const share = (userId: Id<"users">, recipeId: Id<"recipes">) =>
  t.withIdentity(asUser(userId)).mutation(api.router.recipes.recordShare.authed, { id: recipeId });

/** What each send handed PostHog, without the scheduler ctx it is called with. */
const sent = () => capture.mock.calls.map(([, args]) => args);

beforeEach(() => {
  t = convexTest(schema, modules);
  capture.mockClear();
});

describe("router/recipes/recordShare", () => {
  test("rejects an unauthenticated caller, and sends nothing", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(t.mutation(api.router.recipes.recordShare.authed, { id: recipeId })).rejects.toThrow();
    expect(sent()).toEqual([]);
  });

  test("reports a cook sharing their own recipe", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await share(userId, recipeId);

    expect(sent()).toEqual([
      { distinctId: userId, event: "recipe shared", properties: { recipeId, recipeOrigin: "typed", isOwned: true } },
    ]);
  });

  /** Sharing is reading (ADR 0014): another cook's recipe goes out like one's own, marked as not theirs. */
  test("reports a cook sharing another cook's recipe as not theirs", async () => {
    const ownerId = await seedUser("Franck");
    const friendId = await seedUser("Friend");
    const recipeId = await seedRecipe(ownerId);

    await share(friendId, recipeId);

    expect(sent()).toEqual([
      { distinctId: friendId, event: "recipe shared", properties: { recipeId, recipeOrigin: "typed", isOwned: false } },
    ]);
  });

  test("reports a catalog recipe, which nobody owns", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe();

    await share(userId, recipeId);

    expect(sent()[0]).toMatchObject({ properties: { recipeId, recipeOrigin: "catalog", isOwned: false } });
  });

  /** The link already went out: the share is reported with what is left, never refused. */
  test("reports a recipe that is gone with its bare id", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await t.run((ctx) => ctx.db.delete(recipeId));

    await share(userId, recipeId);

    expect(sent()).toEqual([
      { distinctId: userId, event: "recipe shared", properties: { recipeId, isOwned: false } },
    ]);
  });
});
