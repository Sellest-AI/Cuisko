import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { registerRateLimiter, rateLimitedCook, warmRateLimiter } from "../../../lib/__tests__/rateLimiter.fixtures";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * The two halves of `importVideoNode` that leave the process, replaced wholesale, without
 * `importOriginal`: the page fetch (and `node:https` with it) and the model are never loaded. What
 * this file can see is the order of the gates above them, and the wiring: which address is fetched,
 * and that the generated recipe becomes a row the caller owns.
 */
const fetchSocialVideo = vi.hoisted(() => vi.fn());
const generateRecipeFromVideo = vi.hoisted(() => vi.fn());
const resolveShortLink = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => vi.fn());

vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));
vi.mock("@convex/lib/socialVideo/fetchSocialVideo", () => ({ fetchSocialVideo }));
vi.mock("@convex/lib/socialVideo/resolveShortLink", () => ({ resolveShortLink }));
vi.mock("@convex/functions/recipes/generateRecipeFromVideo", () => ({ generateRecipeFromVideo }));

let t: ReturnType<typeof convexTest>;

const REEL = "https://www.instagram.com/nicomerco/reel/DcTtz3Ftj9I/?igsh=MWZ0eGx5bGRzZ3Z5aQ==";
const CANONICAL = "https://www.instagram.com/p/DcTtz3Ftj9I/";

/** What the TikTok app's share button hands over, and the video it redirects to. */
const TIKTOK_SHORT = "https://vm.tiktok.com/ZMabc123/";
const TIKTOK_CANONICAL = "https://www.tiktok.com/@/video/7690673524758924557";

const RECIPE = {
  title: "Poulet croustillant aux cornflakes",
  description: "Un bol de riz et de poulet pané, croustillant sans friture.",
  servings: 2,
  difficulty: 2 as const,
  cuisine: "other" as const,
  tags: ["main" as const],
  equipments: ["air fryer" as const],
  timings: { preparation: 20, cooking: 20, resting: 30 },
  instructions: [{ steps: [{ instruction: "Paner le poulet.", hints: [] }] }],
  ingredients: [{ name: "blanc de poulet", quantity: 2, unit: "pcs" as const }],
};

/**
 * Narrow, as in `importOne.test.ts`, but wider than "this router file": everything a successful
 * import loads is warmed too. That is the Node half (its paid graph is mocked out above, so it is
 * cheap), `createOne` (where the persist lives) and the two follow-ups it schedules. Left cold they
 * cost the first import ~1 s alone, against ~5 ms for the next, and past the 5 s timeout in a full
 * `pnpm verify`. Warming does not let a refusal reach them: that is still what those tests assert.
 */
const WARM = /^\/convex\/router\/recipes\/(importVideo|importVideoNode|createOne|translateOne|generateImages)\./;

beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => WARM.test(path))
      .map(([, load]) => load()),
  ).then(warmRateLimiter),
);

/**
 * A successful import schedules the translation and the images with `runAfter(0)`. Faked timers
 * dropped after each test keep them from firing against a finished instance (the same reasoning
 * `createOne.test.ts` writes out), and from calling the real model.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
  registerRateLimiter(t);
  capture.mockReset();
  // Nothing in this file may reach a network: a passing refusal then proves it came first.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests"))));
  fetchSocialVideo.mockReset();
  fetchSocialVideo.mockImplementation((source: object) =>
    Promise.resolve({ ...source, caption: "Tasty Crousty", videoUrl: "https://scontent-test.cdninstagram.com/v.mp4" }),
  );
  generateRecipeFromVideo.mockReset();
  generateRecipeFromVideo.mockResolvedValue({ recipe: RECIPE, links: [] });
  resolveShortLink.mockReset();
  resolveShortLink.mockResolvedValue({ platform: "tiktok", id: "7690673524758924557", canonicalUrl: TIKTOK_CANONICAL });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A cook past the gate: `usersExtended` carries the role `resolveUser` reads. */
const seedCook = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

const seedRecipe = (
  userId: Id<"users">,
  { isArchived, sourceUrl = CANONICAL }: { isArchived: boolean; sourceUrl?: string },
) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      userId,
      isArchived,
      title: { values: { fr: "Poulet croustillant" }, meta: {} },
      instructions: { values: { fr: "- Paner." }, meta: {} },
      difficulty: 2,
      cuisine: "other",
      sourceUrl,
      updatedAt: 1,
    }),
  );

describe("router/recipes/importVideo", () => {
  /** The gate (C5): the rejection lands in the procedure wrapper, before a fetch or a token. */
  test("rejects an unauthenticated caller", async () => {
    await expect(t.action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" })).rejects.toThrow();
    expect(fetchSocialVideo).not.toHaveBeenCalled();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(t.withIdentity(asUser(ghost)).action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" })).rejects.toThrow();
  });

  test("refuses a caller who has hit their rate limit, before any fetch, and stores nothing", async () => {
    const { cook } = await rateLimitedCook(t, "recipeVideoImport");

    await expect(cook.action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" })).rejects.toMatchObject({
      data: { code: "RATE_LIMITED" },
    });

    expect(fetchSocialVideo).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(0);
  });

  test.each(["https://www.marmiton.org/recettes/recette_poulet.aspx", "https://www.instagram.com/nicomerco/", "   "])(
    "refuses %j as INVALID_INPUT, before any fetch",
    async (url) => {
      const userId = await seedCook();

      await expect(t.withIdentity(asUser(userId)).action(api.router.recipes.importVideo.authed, { url, locale: "fr" })).rejects.toMatchObject({
        data: { code: "INVALID_INPUT" },
      });
      expect(fetchSocialVideo).not.toHaveBeenCalled();
    },
  );

  test("imports a reel as a recipe the caller owns, under the canonical address", async () => {
    const userId = await seedCook();

    const { recipeId, isOwned } = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" });

    expect(isOwned).toBe(true);
    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row).toMatchObject({ userId, sourceUrl: CANONICAL, status: "generated", isArchived: false });
    expect(fetchSocialVideo).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", id: "DcTtz3Ftj9I", canonicalUrl: CANONICAL }),
    );
    expect(generateRecipeFromVideo.mock.calls[0]![1]).toMatchObject({
      caption: "Tasty Crousty",
      videoUrl: "https://scontent-test.cdninstagram.com/v.mp4",
    });
  });

  test("reports the reel imported, as a video", async () => {
    const userId = await seedCook();

    const { recipeId } = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" });

    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      { distinctId: userId, event: "recipe imported", properties: { recipeId, source: "video", ingredients: 1 } },
    ]);
  });

  /** The same video shared again made nothing new: the cook was handed the recipe the first share made. */
  test("reports nothing when the video was already imported", async () => {
    const userId = await seedCook();
    await seedRecipe(userId, { isArchived: false });

    await t.withIdentity(asUser(userId)).action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" });

    expect(capture).not.toHaveBeenCalled();
  });

  /** A video that teaches no dish leaves no row behind: a made-up recipe would be served to every later share. */
  test("stores nothing when the video teaches no recipe, and says so", async () => {
    const userId = await seedCook();
    generateRecipeFromVideo.mockRejectedValue(new ConvexError({ code: "NOT_A_RECIPE", message: "No recipe" }));

    await expect(
      t.withIdentity(asUser(userId)).action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" }),
    ).rejects.toMatchObject({ data: { code: "NOT_A_RECIPE" } });
    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(0);
  });

  /**
   * A second share of the same video is free: the recipe the first one made comes back, with no
   * fetch, no model and no token. Asked by a cook already out of tokens, under another spelling of
   * the link, because that is what proves the dedupe comes before the rate limit.
   */
  test("returns the cook's existing recipe from the same video, without a fetch or a token", async () => {
    const { userId, cook } = await rateLimitedCook(t, "recipeVideoImport");
    const existing = await seedRecipe(userId, { isArchived: false });

    const imported = await cook.action(api.router.recipes.importVideo.authed, {
      url: "https://instagram.com/reel/DcTtz3Ftj9I",
      locale: "fr",
    });

    expect(imported).toEqual({ recipeId: existing, isOwned: true });
    expect(fetchSocialVideo).not.toHaveBeenCalled();
  });

  test("imports again when the cook's recipe from that video was deleted", async () => {
    const userId = await seedCook();
    const archived = await seedRecipe(userId, { isArchived: true });

    const { recipeId } = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" });

    expect(recipeId).not.toBe(archived);
    expect(fetchSocialVideo).toHaveBeenCalledTimes(1);
  });

  /**
   * A video another cook already imported is theirs to share, not ours to pay for again: the caller
   * gets that recipe, told it is not their own so the app can favorite it. Asked by a cook already
   * out of tokens, to prove no token is charged for it.
   */
  test("returns another cook's recipe from the same video as not owned, without a fetch or a token", async () => {
    const other = await seedCook();
    const theirs = await seedRecipe(other, { isArchived: false });
    const { cook } = await rateLimitedCook(t, "recipeVideoImport");

    const imported = await cook.action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" });

    expect(imported).toEqual({ recipeId: theirs, isOwned: false });
    expect(fetchSocialVideo).not.toHaveBeenCalled();
  });

  test("never answers with a deleted import, another cook's included", async () => {
    const other = await seedCook();
    const deleted = await seedRecipe(other, { isArchived: true });
    const userId = await seedCook();

    const { recipeId, isOwned } = await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" });

    expect(recipeId).not.toBe(deleted);
    expect(isOwned).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(recipeId))).toMatchObject({ userId });
  });

  describe("a short link, as the TikTok app shares", () => {
    test("is followed to its video, which is imported under the video's canonical address", async () => {
      const userId = await seedCook();

      const { recipeId } = await t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.importVideo.authed, { url: TIKTOK_SHORT, locale: "fr" });

      expect(resolveShortLink).toHaveBeenCalledWith(TIKTOK_SHORT);
      expect(fetchSocialVideo).toHaveBeenCalledWith(expect.objectContaining({ canonicalUrl: TIKTOK_CANONICAL }));
      expect(await t.run((ctx) => ctx.db.get(recipeId))).toMatchObject({ userId, sourceUrl: TIKTOK_CANONICAL });
    });

    /** The redirect is what makes the dedupe work: the short link and the web link are one video. */
    test("returns the recipe the cook imported from that video's web link, without a fetch or a token", async () => {
      const { userId, cook } = await rateLimitedCook(t, "recipeVideoImport");
      const existing = await seedRecipe(userId, { isArchived: false, sourceUrl: TIKTOK_CANONICAL });

      const imported = await cook.action(api.router.recipes.importVideo.authed, { url: TIKTOK_SHORT, locale: "fr" });

      expect(imported).toEqual({ recipeId: existing, isOwned: true });
      expect(fetchSocialVideo).not.toHaveBeenCalled();
    });

    /** Resolving is free of any model but not of cost: a Node action and a request to TikTok each. */
    test("is refused once the cook has resolved too many, before any request", async () => {
      const { cook } = await rateLimitedCook(t, "videoLinkResolve");

      await expect(
        cook.action(api.router.recipes.importVideo.authed, { url: TIKTOK_SHORT, locale: "fr" }),
      ).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
      expect(resolveShortLink).not.toHaveBeenCalled();
    });

    test("does not spend a link token on a link that names its video", async () => {
      const { cook } = await rateLimitedCook(t, "videoLinkResolve");

      await expect(cook.action(api.router.recipes.importVideo.authed, { url: REEL, locale: "fr" })).resolves.toMatchObject({
        isOwned: true,
      });
    });

    test("that leads to no video is refused as the resolver says, before a fetch", async () => {
      const userId = await seedCook();
      resolveShortLink.mockRejectedValue(new ConvexError({ code: "NOT_FOUND", message: "This link leads to no video" }));

      await expect(
        t.withIdentity(asUser(userId)).action(api.router.recipes.importVideo.authed, { url: TIKTOK_SHORT, locale: "fr" }),
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      expect(fetchSocialVideo).not.toHaveBeenCalled();
    });
  });
});
