import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * The two calls this path spends money on, mocked so `authed` can be exercised end to end for
 * free — the same pair `updateOne.test.ts` stubs, for the same reason.
 *
 * Nothing here asserts on what either ANSWERS; that belongs to `sanitizeRecipe`'s own test and to
 * `resolveRecipeIngredients.test.ts`. What only this file can see is the wiring between them: that
 * the links the resolver returned reach `_internal_persist` and become the recipe's ingredient
 * rows. A router that resolved and then dropped the answer would pass every test on either side.
 */
const sanitizeRun = vi.hoisted(() => vi.fn());
const resolveRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/agent/tools/sanitizeRecipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../agent/tools/sanitizeRecipe")>();
  return { ...actual, sanitizeRecipe: { run: sanitizeRun } };
});

vi.mock("@convex/functions/recipes/resolveRecipeIngredients", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../functions/recipes/resolveRecipeIngredients")>();
  return { ...actual, resolveRecipeIngredients: resolveRun };
});

let t: ReturnType<typeof convexTest>;

const FREE_TEXT = {
  locale: "fr" as const,
  servings: 4,
  ingredients: "2 oignons\n2 cs d'huile d'olive",
  instructions: "Émincer les oignons, les faire suer, servir.",
};

const RECIPE = {
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  servings: 4,
  difficulty: 2 as const,
  cuisine: "french" as const,
  tags: ["soup" as const],
  equipments: [],
  timings: { preparation: 15 },
  instructions: [{ title: "Base", steps: ["Émincer les oignons."] }],
  ingredients: [{ name: "oignon", quantity: 2, unit: "pcs" as const }],
};

/**
 * The module graph this file exercises, imported before anything is timed — the same narrow warm-up
 * `router/ingredients/__tests__/resolve.test.ts` documents at length, for the same reason.
 *
 * `import.meta.glob` hands convex-test LAZY loaders, so the graph is instantiated on the first call
 * that needs it and billed to whichever test made that call — here the authorization rejection at
 * the top, whose own subject should cost microseconds. This slice added three modules to that graph
 * and pushed the first test to ~5s against Vitest's default timeout.
 *
 * Narrow on purpose: warming the whole glob measures four times slower, because every file that
 * globs `convex/` would then import the entire backend rather than the part it uses.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/createOne"))
      .map(([, load]) => load()),
  ),
);

beforeEach(() => {
  t = convexTest(schema, modules);
  sanitizeRun.mockReset();
  sanitizeRun.mockResolvedValue(RECIPE);
  resolveRun.mockReset();
  resolveRun.mockResolvedValue({ links: [], complete: true });
});

describe("router/recipes/createOne", () => {
  /**
   * The gate, and the only assertion this file can make about `authed` without a model in the
   * loop: the rejection has to happen in the procedure wrapper, before a single token is spent.
   */
  test("rejects an unauthenticated caller", async () => {
    await expect(t.action(api.router.recipes.createOne.authed, FREE_TEXT)).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t.withIdentity(asUser(ghost)).action(api.router.recipes.createOne.authed, FREE_TEXT),
    ).rejects.toThrow();
  });

  test("_internal_persist stores the recipe against the owner it was handed", async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    const recipeId = await t.mutation(internal.router.recipes.createOne._internal_persist, {
      userId,
      locale: "fr",
      recipe: RECIPE,
      links: [],
    });

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.userId).toBe(userId);
    expect(row!.title.values.fr).toBe("Soupe à l'oignon");
  });

  /**
   * The wiring, end to end. `updateOne.test.ts` has covered its own path since this slice landed;
   * without this, the create path's `generateRecipe -> links -> persist` chain was never run by a
   * test at all, and a router that resolved the lines then persisted an empty set would be green.
   */
  test("stores the links the resolver answered with as the recipe's ingredient rows", async () => {
    // `usersExtended` too: `resolveUser` reads the role off it, and a user without one is
    // UNAUTHENTICATED — the tests above never noticed because they never get past the gate.
    const userId = await t.run(async (ctx) => {
      const user = await ctx.db.insert("users", { name: "Franck" });
      await ctx.db.insert("usersExtended", { userId: user, role: "USER", updatedAt: Date.now() });

      return user;
    });

    const onionId = await t.run((ctx) =>
      ctx.db.insert("ingredients", {
        name: { values: { fr: "oignon", en: "onion" }, meta: {} },
        search: { fr: "oignon", en: "onion" },
        category: "OTHER",
        emoji: "🧅",
        diet: "vegan",
        allergens: [],
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      }),
    );

    resolveRun.mockResolvedValue({
      links: [{ ingredientId: onionId, position: 0, quantity: 2, unit: "pcs" }],
      complete: true,
    });

    const recipeId: Id<"recipes"> = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.createOne.authed, FREE_TEXT);

    const rows = await t.run(async (ctx) => {
      const all = await ctx.db.query("recipeIngredients").collect();
      return all.filter((row) => row.recipeId === recipeId);
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.ingredientId).toBe(onionId);
    expect(rows[0]!.quantity).toBe(2);
  });
});
