import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { registerRateLimiter, rateLimitedCook, warmRateLimiter } from "../../../lib/__tests__/rateLimiter.fixtures";

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
const capture = vi.hoisted(() => vi.fn());

vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

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
  instructions: "Émincer les oignons, les faire suer, servir.\n> Une mandoline va plus vite",
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
  instructions: [
    { title: "Base", steps: [{ instruction: "Émincer les oignons.", hints: ["Une mandoline va plus vite."] }] },
  ],
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
  ).then(warmRateLimiter),
);

/**
 * `authed` schedules two follow-ups with `runAfter(0)` — the translation and the images — and
 * nothing in this file asserts on either. Left alone they fire on a real timer a few ms after the
 * test that scheduled them, against an instance that is already gone, and Vitest reports the
 * rejection as an unhandled error against this file — only under load, when the whole suite runs
 * in the pre-commit hook, and never when the file runs alone.
 *
 * Only the timer functions are faked, so `Date.now()` stays real for the `updatedAt` columns the
 * seeds write; and the pending timers are dropped after each test rather than run, since running
 * them would call the model and the image service for real. The two paths have their own tests.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
  registerRateLimiter(t);
  sanitizeRun.mockReset();
  sanitizeRun.mockResolvedValue(RECIPE);
  resolveRun.mockReset();
  resolveRun.mockResolvedValue({ links: [], complete: true });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

/**
 * A cook who gets past the gate. `usersExtended` too: `resolveUser` reads the role off it, and a
 * user without one is UNAUTHENTICATED — the rejection tests never notice because they never get
 * past the gate.
 */
const seedUser = () =>
  t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId: user, role: "USER", updatedAt: Date.now() });

    return user;
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

  test("refuses a caller who has hit their rate limit, before the agent runs, and stores nothing", async () => {
    const { cook } = await rateLimitedCook(t, "recipeWrite");

    await expect(cook.action(api.router.recipes.createOne.authed, FREE_TEXT)).rejects.toMatchObject({
      data: { code: "RATE_LIMITED" },
    });

    expect(sanitizeRun).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(0);
  });

  /** The prompt tells the model to keep every `>` line; it can only keep one it was actually handed. */
  test("hands the agent the cook's hint lines as they wrote them", async () => {
    const userId = await seedUser();

    await t.withIdentity(asUser(userId)).action(api.router.recipes.createOne.authed, FREE_TEXT);

    expect(sanitizeRun.mock.calls[0]![1]).toMatchObject({
      instructions: "Émincer les oignons, les faire suer, servir.\n> Une mandoline va plus vite",
    });
  });

  /** The stored `sourceUrl` drops a video's address, so the source is told apart before it is. */
  test("a typed recipe is created; one from a page or a video is imported, with its source", async () => {
    const userId = await seedUser();
    capture.mockReset();

    const typed = await t.withIdentity(asUser(userId)).action(api.router.recipes.createOne.authed, FREE_TEXT);
    const page = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.createOne.authed, { ...FREE_TEXT, sourceUrl: "https://www.marmiton.org/soupe-oignon" });
    const reel = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.createOne.authed, { ...FREE_TEXT, sourceUrl: "https://www.instagram.com/reel/C8soupe/" });

    const reported = capture.mock.calls
      .map(([, args]) => args)
      .filter((args) => args.event === "recipe created" || args.event === "recipe imported");
    expect(reported).toEqual([
      { distinctId: userId, event: "recipe created", properties: { recipeId: typed, ingredients: 1 } },
      { distinctId: userId, event: "recipe imported", properties: { recipeId: page, source: "link", ingredients: 1 } },
      { distinctId: userId, event: "recipe imported", properties: { recipeId: reel, source: "video", ingredients: 1 } },
    ]);
  });

  /** The dashboard and the seeds write the catalog through `_internal`: no cook made anything. */
  test("_internal reports nothing, having no cook", async () => {
    capture.mockReset();

    await t.action(internal.router.recipes.createOne._internal, FREE_TEXT);

    expect(capture).not.toHaveBeenCalled();
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
    // The agent's hint is stored under its step, where the cooking session will read it back.
    expect(row!.instructions.values.fr).toBe("## Base\n- Émincer les oignons.\n> Une mandoline va plus vite.");
  });

  /**
   * The wiring, end to end. `updateOne.test.ts` has covered its own path since this slice landed;
   * without this, the create path's `generateRecipe -> links -> persist` chain was never run by a
   * test at all, and a router that resolved the lines then persisted an empty set would be green.
   */
  test("stores the links the resolver answered with as the recipe's ingredient rows", async () => {
    const userId = await seedUser();

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

  /**
   * The seam this slice adds: an imported draft's address rides `createOne` to the row, and rides
   * it AROUND the agent — the URL is where the recipe came from, not text to revise, and a model
   * handed it would have to be told to ignore it.
   */
  describe("sourceUrl", () => {
    test("lands on the row, canonical, when the draft carries one", async () => {
      const userId = await seedUser();

      const recipeId: Id<"recipes"> = await t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.createOne.authed, {
          ...FREE_TEXT,
          sourceUrl: "https://example.com/soupe?utm_source=fb",
        });

      const row = await t.run((ctx) => ctx.db.get(recipeId));
      expect(row!.sourceUrl).toBe("https://example.com/soupe");
    });

    test("stays absent on a recipe typed by hand", async () => {
      const userId = await seedUser();

      const recipeId: Id<"recipes"> = await t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.createOne.authed, FREE_TEXT);

      const row = await t.run((ctx) => ctx.db.get(recipeId));
      expect(row!.sourceUrl).toBeUndefined();
    });

    /**
     * A video's address is the key `importVideo` answers every cook's share with (`findBySource`),
     * so only the video import may write one. Typed with a recipe of a cook's own, it would be
     * served to everyone who later shares that video.
     */
    test.each([
      "https://www.instagram.com/p/DcTtz3Ftj9I/",
      "https://www.tiktok.com/@/video/7690673524758924557",
      "https://vm.tiktok.com/ZMabc123/",
    ])("stores nothing for %s, a video address only the video import may claim", async (sourceUrl) => {
      const userId = await seedUser();

      const recipeId: Id<"recipes"> = await t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.createOne.authed, { ...FREE_TEXT, sourceUrl });

      const row = await t.run((ctx) => ctx.db.get(recipeId));
      expect(row!.sourceUrl).toBeUndefined();
    });

    test("stores nothing for text that is not a web address, without refusing the recipe", async () => {
      const userId = await seedUser();

      const recipeId: Id<"recipes"> = await t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.createOne.authed, { ...FREE_TEXT, sourceUrl: "   " });

      const row = await t.run((ctx) => ctx.db.get(recipeId));
      expect(row!.sourceUrl).toBeUndefined();
    });

    test("never reaches the agent", async () => {
      const userId = await seedUser();

      await t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.createOne.authed, {
          ...FREE_TEXT,
          sourceUrl: "https://example.com/soupe",
        });

      expect(sanitizeRun).toHaveBeenCalledTimes(1);
      expect(sanitizeRun.mock.calls[0]![1]).not.toHaveProperty("sourceUrl");
    });
  });
});
