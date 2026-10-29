import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { loadRecipeContent } from "../../../functions/recipes/recipeContent";
import type { RecipeStatus } from "../../../schema/recipes";
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

/** The recipe's text as every reader sees it, wherever it is stored. */
const textOf = (recipeId: Id<"recipes">) => t.run(async (ctx) => loadRecipeContent(ctx, (await ctx.db.get(recipeId))!));

const seedUser = (name: string, role: "USER" | "ADMIN") =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role, updatedAt: Date.now() });

    return userId;
  });

/** A catalog recipe: no owner, which is exactly the row `updateOne.authed` could never reach. */
const seedRecipe = (sourceUrl?: string, status: RecipeStatus = "generated") =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status,
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

  /** Accepted as it stands: its content is not rewritten, only its status — see `recipes.status`. */
  test("leaves a recipe the verifier found nothing wrong with untouched, and marks it reviewed", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL);
    verifyRun.mockResolvedValue({ corrections: [], recipe: null });

    expect(await verify(adminId, recipeId)).toEqual({ verdict: "unchanged" });

    expect(resolveRun).not.toHaveBeenCalled();
    const row = (await t.run((ctx) => ctx.db.get(recipeId)))!;
    expect(row.instructions.values.fr).toBe("- Faites frire le poulet.");
    expect(row.status).toBe("reviewed");
  });

  /** A verify always ends `reviewed`, from a cook's own `edited` recipe too, whatever it found. */
  test.each([
    ["unchanged", null],
    ["rewritten", CORRECTED],
  ] as const)("marks an edited recipe reviewed when the verdict is %s", async (_verdict, recipe) => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL, "edited");
    verifyRun.mockResolvedValue({ corrections: recipe ? ["Huile : la friture manquait."] : [], recipe });

    await verify(adminId, recipeId);

    expect((await t.run((ctx) => ctx.db.get(recipeId)))!.status).toBe("reviewed");
  });

  /**
   * The verifier judged the text it was handed, not a cook's save landing during the scrape and
   * model call: that save must neither be overwritten nor marked `reviewed` — see `assertUnchangedSince`.
   */
  test.each([
    ["unchanged", null],
    ["rewritten", CORRECTED],
  ] as const)("refuses to write when the cook saved during a verify whose verdict is %s", async (_verdict, recipe) => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL, "edited");
    const cookText = { values: { fr: "- Faites frire 2 blancs de poulet." }, meta: {} };
    verifyRun.mockImplementation(async () => {
      await t.run((ctx) => ctx.db.patch(recipeId, { instructions: cookText, updatedAt: 2 }));
      return { corrections: recipe ? ["Huile : la friture manquait."] : [], recipe };
    });

    await expect(verify(adminId, recipeId)).rejects.toThrow();

    const row = (await t.run((ctx) => ctx.db.get(recipeId)))!;
    expect(row.status).toBe("edited");
    expect(row.instructions.values.fr).toBe("- Faites frire 2 blancs de poulet.");
  });

  /** The ingredient lines are part of what the verifier judged, not only the text. */
  test("refuses to write when the cook changed a quantity during the verify", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL, "edited");
    const lineId = await t.run(async (ctx) => {
      const chicken = await ctx.db.insert("ingredients", {
        name: { values: { fr: "blanc de poulet" }, meta: {} },
        search: { fr: "blanc de poulet" },
        category: "MEAT",
        emoji: "🍗",
        diet: "omnivore",
        allergens: [],
        defaultUnit: "g",
        defaultQuantity: 500,
        nutrition: { calories: 120, protein: 23, fat: 2, carbohydrates: 0 },
        updatedAt: 1,
      });
      return ctx.db.insert("recipeIngredients", { recipeId, ingredientId: chicken, position: 0, quantity: 600, unit: "g", updatedAt: 1 });
    });
    verifyRun.mockImplementation(async () => {
      await t.run((ctx) => ctx.db.patch(lineId, { quantity: 400 }));
      return { corrections: [], recipe: null };
    });

    await expect(verify(adminId, recipeId)).rejects.toThrow();

    expect((await t.run((ctx) => ctx.db.get(recipeId)))!.status).toBe("edited");
  });

  /**
   * What lands on a fresh import while it is verified: the translation into the other language
   * (`saveTranslations`) and the photos (`recipeImages`) both write the row, and neither touches the
   * text the verifier judged — so neither may refuse its verdict.
   */
  test.each([
    ["unchanged", null],
    ["rewritten", CORRECTED],
  ] as const)("still writes a %s verdict when only the translation and photos landed meanwhile", async (_verdict, recipe) => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL, "edited");
    verifyRun.mockImplementation(async () => {
      await t.run(async (ctx) => {
        const row = (await ctx.db.get(recipeId))!;
        await ctx.db.patch(recipeId, { title: { ...row.title, values: { ...row.title.values, en: "Fried chicken" } }, updatedAt: 2 });
        await ctx.db.patch(recipeId, { updatedAt: 3 });
      });
      return { corrections: recipe ? ["Huile : la friture manquait."] : [], recipe };
    });

    await verify(adminId, recipeId);

    expect((await t.run((ctx) => ctx.db.get(recipeId)))!.status).toBe("reviewed");
  });

  /**
   * A cook's FIRST edit leaves a recipe `reviewed`, so finding it `reviewed` at write time does not
   * mean nothing changed: the check still runs, and refuses a verdict on text the verifier never read.
   */
  test("refuses an unchanged verdict when the cook's first edit landed during the verify", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL, "generated");
    verifyRun.mockImplementation(async () => {
      await t.run((ctx) =>
        ctx.db.patch(recipeId, {
          instructions: { values: { fr: "- Faites frire 400 g de poulet." }, meta: {} },
          status: "reviewed",
        }),
      );
      return { corrections: [], recipe: null };
    });

    await expect(verify(adminId, recipeId)).rejects.toThrow();
  });

  test("does not write a recipe already reviewed that the verifier found nothing wrong with", async () => {
    const adminId = await seedUser("Admin", "ADMIN");
    const recipeId = await seedRecipe(SOURCE_URL, "reviewed");
    verifyRun.mockResolvedValue({ corrections: [], recipe: null });

    await verify(adminId, recipeId);

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
    expect((await textOf(recipeId)).instructions.values.fr).toContain("600 g de blanc de poulet");
    expect(row.updatedAt).not.toBe(1);
  });
});

/** `catalog:verify`'s path: the same verify through a deploy key, with no caller to rate limit. */
describe("router/recipes/verifyOne._internal", () => {
  const verifyInternal = (recipeId: Id<"recipes">, locale: "fr" | "en" = "fr") =>
    t.action(internal.router.recipes.verifyOne._internal, { recipeId, locale });

  test("refuses a recipe that was not imported from a page", async () => {
    const recipeId = await seedRecipe();

    await expect(verifyInternal(recipeId)).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

    expect(verifyRun).not.toHaveBeenCalled();
  });

  test("marks a catalog recipe the verifier found nothing wrong with reviewed", async () => {
    const recipeId = await seedRecipe(SOURCE_URL);
    verifyRun.mockResolvedValue({ corrections: [], recipe: null });

    expect(await verifyInternal(recipeId)).toEqual({ verdict: "unchanged" });

    expect((await t.run((ctx) => ctx.db.get(recipeId)))!.status).toBe("reviewed");
  });

  test("rewrites a catalog recipe the verifier corrected, in the locale it was given", async () => {
    const recipeId = await seedRecipe(SOURCE_URL);
    const corrections = ["Huile : la friture manquait."];
    verifyRun.mockResolvedValue({ corrections, recipe: CORRECTED });

    expect(await verifyInternal(recipeId)).toEqual({ verdict: "rewritten", corrections });

    const [, input] = verifyRun.mock.calls[0]!;
    expect(input.locale).toBe("fr");
    const row = (await t.run((ctx) => ctx.db.get(recipeId)))!;
    expect((await textOf(recipeId)).instructions.values.fr).toContain("600 g de blanc de poulet");
    expect(row.status).toBe("reviewed");
  });
});
