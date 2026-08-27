import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";

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

const seedRecipe = (userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
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

beforeEach(() => {
  t = convexTest(schema, modules);
  sanitizeRun.mockReset();
  sanitizeRun.mockResolvedValue(RECIPE);
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
   * The point of `recipeChangesOf`: an edit that never touched the ingredients has nothing for the
   * agent to re-derive, so it is not asked.
   */
  test("does not call the agent when only the title changed", async () => {
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

  test("calls the agent when the ingredients changed", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, {
        ...UNCHANGED,
        recipeId,
        ingredients: "2 oignons",
      });

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
    });

    expect(returned).toBe(recipeId);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Soupe à l'oignon, revisitée");

    const rows = await t.run((ctx) => ctx.db.query("recipes").collect());
    expect(rows).toHaveLength(1);
  });
});
