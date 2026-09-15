import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { parseInstructions, serializeInstructions } from "../../../../shared/recipes";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * The one call `updateOne` can spend a token on, mocked so a test can assert on WHETHER it ran
 * without waiting on — or paying for — a real model. `sanitizeRecipe.run`'s actual behaviour is
 * `sanitizeRecipe`'s own test's job; this file only needs to know it was, or was not, reached.
 */
const sanitizeRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/agent/tools/sanitizeRecipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../agent/tools/sanitizeRecipe")>();
  return { ...actual, sanitizeRecipe: { run: sanitizeRun } };
});

/**
 * The other call this path spends money on, mocked for the same reason as the agent above: a
 * resolve reaches two live APIs and can call a model per name, and no test may buy either.
 *
 * Nothing here asserts on it — what it is asked and what it answers belong to
 * `regenerateRecipe.test.ts` and `resolveRecipeIngredients.test.ts`. It is stubbed so that
 * exercising `authed` end to end stays free.
 */
const resolveRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/recipes/resolveRecipeIngredients", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../functions/recipes/resolveRecipeIngredients")>();
  return { ...actual, resolveRecipeIngredients: resolveRun };
});

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

/** The stored text, and the free text that round-trips back to exactly this — see the tests below. */
const SEED_INSTRUCTIONS = "Base\n- Émincer les oignons.";
const UNCHANGED_INSTRUCTIONS = serializeInstructions(parseInstructions(SEED_INSTRUCTIONS));

const seedRecipe = (userId: Id<"users">, sourceUrl?: string) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      sourceUrl,
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: SEED_INSTRUCTIONS }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      userId,
      tags: ["soup"],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { fr: "oignon" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    }),
  );

/** Changes nothing against `seedRecipe` — no ingredient rows are seeded, so `""` is "unchanged" too. */
const UNCHANGED = {
  locale: "fr" as const,
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  servings: 4,
  ingredients: "",
  instructions: UNCHANGED_INSTRUCTIONS,
};

const RECIPE = {
  title: "Soupe à l'oignon, revisitée",
  description: "Une soupe d'hiver, en mieux.",
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
      .filter(([path]) => path.startsWith("/convex/router/recipes/updateOne"))
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

describe("router/recipes/updateOne", () => {
  /**
   * The gate, and the only assertion this file can make about `authed` without a model in the
   * loop: the rejection has to happen before a single token is spent — same guarantee as
   * `createOne`, on the same builder.
   */
  test("rejects an unauthenticated caller", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t.action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId }),
    ).rejects.toThrow();

    expect(sanitizeRun).not.toHaveBeenCalled();
  });

  /**
   * The check this file exists to add over `createOne`'s: a stranger's `recipeId` is refused
   * before their free text ever reaches the agent, and the row is left exactly as it was.
   */
  test("refuses to revise a recipe the caller does not own", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    await expect(
      t
        .withIdentity(asUser(strangerId))
        .action(api.router.recipes.updateOne.authed, {
          ...UNCHANGED,
          recipeId,
          title: "Stolen",
        }),
    ).rejects.toThrow();

    expect(sanitizeRun).not.toHaveBeenCalled();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Soupe à l'oignon");
  });

  test("rejects a blank title", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, title: "   " }),
    ).rejects.toThrow();
  });

  test("rejects a blank description", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, description: "" }),
    ).rejects.toThrow();
  });

  /**
   * The wiring, end to end, and deliberately not the decision: WHETHER the agent runs is
   * `regenerateRecipe`'s call and is asserted in its own test. What only this file can see is that
   * the answer reaches the persist — `analyzed` decides whether the row records the text as the
   * machine's or as the cook's own, and a router that dropped it on the floor would still pass
   * every test on either side of it.
   */
  test("stores an edit the agent never saw as the cook's own words", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, title: "Nouveau titre" });

    expect(sanitizeRun).not.toHaveBeenCalled();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Nouveau titre");
    expect(row!.title.meta.fr!.status).toBe("edited");
  });

  test("stores an edit the agent did revise as machine text", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, ingredients: "2 oignons" });

    expect(sanitizeRun).toHaveBeenCalledTimes(1);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.meta.fr!.status).toBe("machine");
  });

  test("_internal_persist patches the row it is handed rather than inserting a new one", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const returned = await t.mutation(internal.router.recipes.updateOne._internal_persist, {
      recipeId,
      locale: "fr",
      recipe: RECIPE,
      analyzed: true,
      links: [],
      complete: true,
    });

    expect(returned).toBe(recipeId);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Soupe à l'oignon, revisitée");

    const rows = await t.run((ctx) => ctx.db.query("recipes").collect());
    expect(rows).toHaveLength(1);
  });

  /**
   * The round trip that has to survive: `updateOne` does not accept `sourceUrl` on purpose — a
   * cook cannot set or clear where a recipe came from — so an edit must leave the stored one
   * exactly as it was. `updateRecipe` patches an explicit field list; this pins that it stays so.
   */
  test("preserves the row's sourceUrl across an edit", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId, "https://example.com/soupe");

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, ingredients: "2 oignons" });

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.sourceUrl).toBe("https://example.com/soupe");
  });
});
