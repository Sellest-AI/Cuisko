import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { enforceRateLimit } from "../../../functions/rateLimits/enforceRateLimit";
import { rateLimitFor } from "../../../lib/rateLimits";
import { registerRateLimiter, warmRateLimiter } from "../../../lib/__tests__/rateLimiter.fixtures";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * The tool, mocked whole: it scrapes the page and calls the model, and this file may do neither.
 * What it answers is set per test; whether it ran, and with which address, is asserted.
 */
const verifyRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/agent/tools/verifyRecipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../agent/tools/verifyRecipe")>();
  return { ...actual, verifyRecipe: { run: verifyRun } };
});

/** Two live APIs and a model per name — see `updateOne.test.ts`. Nothing here asserts on it. */
const resolveRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/recipes/resolveRecipeIngredients", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../functions/recipes/resolveRecipeIngredients")>();
  return { ...actual, resolveRecipeIngredients: resolveRun };
});

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string, role: "USER" | "ADMIN") =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role, updatedAt: Date.now() });

    return userId;
  });

/** A catalog recipe: no owner, which is exactly the row `updateOne.authed` could never reach. */
const seedRecipe = (sourceUrl?: string) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      sourceUrl,
      title: { values: { fr: "Poulet frit" }, meta: {} },
      description: { values: { fr: "Croustillant." }, meta: {} },
      instructions: { values: { fr: "- Faites frire le poulet." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "american",
      timings: { cooking: 20 },
      search: { fr: "poulet" },
      isVegan: false,
      isVegetarian: false,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
      updatedAt: 1,
    }),
  );

const SOURCE_URL = "https://example.com/poulet-frit";

const CORRECTED = {
  title: "Poulet frit",
  description: "Croustillant.",
  servings: 4,
  difficulty: 2 as const,
  cuisine: "american" as const,
  tags: [],
  equipments: [],
  timings: { cooking: 20 },
  instructions: [{ steps: [{ instruction: "Faites frire 600 g de blanc de poulet dans l'huile.", hints: [] }] }],
  ingredients: [
    { name: "blanc de poulet", quantity: 600, unit: "g" as const },
    { name: "huile de tournesol", quantity: 101.5, unit: "cl" as const },
  ],
};

/**
 * The modules the tests cross, warmed before anything is timed — see `updateOne.test.ts` (C10).
 * `updateOne` is reached only by the rewrite, through the router's `runMutation`: left cold, its
 * import was billed to that last test, and it timed out under `pnpm verify`.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(
        ([path]) =>
          path.startsWith("/convex/router/recipes/verifyOne.") ||
          path.startsWith("/convex/router/recipes/getOne.") ||
          path.startsWith("/convex/router/recipes/updateOne."),
      )
      .map(([, load]) => load()),
  ).then(warmRateLimiter),
);

/** A rewrite schedules the translation with `runAfter(0)`; faked so it never fires — see `updateOne.test.ts`. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
  registerRateLimiter(t);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests"))));
  verifyRun.mockReset();
  resolveRun.mockReset();
  resolveRun.mockResolvedValue({ links: [], complete: true });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const verify = (userId: Id<"users">, recipeId: Id<"recipes">) =>
  t.withIdentity(asUser(userId)).action(api.router.recipes.verifyOne.admin, { recipeId, locale: "fr" });

describe("router/recipes/verifyOne", () => {
  test("rejects an unauthenticated caller before the verifier runs", async () => {
    const recipeId = await seedRecipe(SOURCE_URL);

    await expect(t.action(api.router.recipes.verifyOne.admin, { recipeId, locale: "fr" })).rejects.toThrow();

    expect(verifyRun).not.toHaveBeenCalled();
  });

  /** The gate (C5): a cook who is not an admin is refused by the builder, before a token is spent. */
  test("rejects a cook who is not an admin", async () => {
    const cookId = await seedUser("Cook", "USER");
    const recipeId = await seedRecipe(SOURCE_URL);

    await expect(verify(cookId, recipeId)).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

    expect(verifyRun).not.toHaveBeenCalled();
  });

  /** ADR 0018: an admin is not exempt, only allowed more — drained here at the admin capacity. */
  test("refuses an admin who used up the allowance, before the verifier runs", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL);
    const limit = rateLimitFor("recipeWrite", true);
    for (let spent = 0; spent < (limit.capacity ?? limit.rate); spent++)
      await t.run((ctx) => enforceRateLimit({ ...ctx, userId: adminId, user: { role: "ADMIN" } }, "recipeWrite"));

    await expect(verify(adminId, recipeId)).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });

    expect(verifyRun).not.toHaveBeenCalled();
  });

  test("refuses a recipe that was not imported from a page", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe();

    await expect(verify(adminId, recipeId)).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

    expect(verifyRun).not.toHaveBeenCalled();
  });

  test("leaves a recipe the verifier found nothing wrong with untouched", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL);
    verifyRun.mockResolvedValue({ corrections: [], recipe: null });

    expect(await verify(adminId, recipeId)).toEqual({ verdict: "unchanged" });

    expect(resolveRun).not.toHaveBeenCalled();
    expect((await t.run((ctx) => ctx.db.get(recipeId)))!.updatedAt).toBe(1);
  });

  test("hands the verifier the stored recipe and the address it was imported from", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL);
    verifyRun.mockResolvedValue({ corrections: [], recipe: null });

    await verify(adminId, recipeId);

    const [, input] = verifyRun.mock.calls[0]!;
    expect(input.stored.title).toBe("Poulet frit");
    expect(input.url).toBe(SOURCE_URL);
  });

  test("rewrites a recipe the verifier corrected, and returns its corrections", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL);
    const corrections = ["Huile : la friture manquait."];
    verifyRun.mockResolvedValue({ corrections, recipe: CORRECTED });

    expect(await verify(adminId, recipeId)).toEqual({ verdict: "rewritten", corrections });

    const row = (await t.run((ctx) => ctx.db.get(recipeId)))!;
    expect(row.instructions.values.fr).toContain("600 g de blanc de poulet");
    expect(row.updatedAt).not.toBe(1);
  });
});
