import agentTest, { register as registerAgent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { ASSISTANT_IDLE_MS } from "../../../../shared/assistant";
import { assistantAgent } from "../../../agent/agents";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { enforceRateLimit } from "../../../functions/rateLimits/enforceRateLimit";
import { registerRateLimiter, warmRateLimiter } from "../../../lib/__tests__/rateLimiterTest";
import { RATE_LIMITS } from "../../../lib/rateLimits";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Warms the module under test before anything is timed — C10 rule 4.
 *
 * The agent component's functions are a second lazy glob, `agentTest.modules`, which
 * `registerAgent` hands to convex-test as-is. Without warming it too, the first test to open a
 * thread pays for the whole component graph — see listMessages.test.ts for the measurement.
 */
beforeAll(() =>
  Promise.all([
    ...Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/assistant/sendMessage."))
      .map(([, load]) => load()),
    ...Object.values(agentTest.modules).map((load) => load()),
    warmRateLimiter(),
  ]),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

type Cook = { userId: Id<"users">; householdId: Id<"households"> };

/** A user who belongs to a household of their own — the cellar is the household's, not the user's. */
const seedUser = (name: string): Promise<Cook> =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", { name, inviteCode: name, updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });

    return { userId, householdId };
  });

/** The cook's clock, fixed: a Thursday evening. */
const CLOCK = { today: 1_000_000, now: "2026-09-24T19:05" };

const ask = ({ userId, householdId }: Cook, text: string, threadId?: string, imageId?: Id<"images">) =>
  t
    .withIdentity(asUser(userId))
    .mutation(api.router.assistant.sendMessage.authed, { text, threadId, imageId, householdId, ...CLOCK, locale: "fr" });

const messagesOf = (threadId: string) =>
  t.run(async (ctx) => {
    const { page } = await assistantAgent.listMessages(ctx, {
      threadId,
      paginationOpts: { numItems: 20, cursor: null },
    });

    return page.map((message) => message.text);
  });

/** An uploaded photo, claimed by `userId` the way `saveImage` records an upload. */
const seedImage = (userId: Id<"users">): Promise<Id<"images">> =>
  t.run(async (ctx) => {
    const imageId = await ctx.db.insert("images", {
      hasAlpha: false,
      key: `users/${userId}/shelf.webp`,
      url: "https://bucket.example/shelf.webp",
      width: 1024,
      height: 768,
      size: 90_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    });
    await ctx.db.insert("userImages", { imageId, userId });

    return imageId;
  });

/** What the thread stored for its newest message, parts and all. */
const lastContentOf = (threadId: string) =>
  t.run(async (ctx) => {
    const { page } = await assistantAgent.listMessages(ctx, {
      threadId,
      paginationOpts: { numItems: 1, cursor: null },
    });

    return page[0]?.message?.content;
  });

beforeEach(() => {
  t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("router/assistant/sendMessage", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(
      t.mutation(api.router.assistant.sendMessage.authed, {
        text: "salut",
        householdId: (await seedUser("Franck")).householdId,
        ...CLOCK,
        locale: "fr",
      }),
    ).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const { householdId } = await seedUser("Franck");
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(ask({ userId: ghost, householdId }, "salut")).rejects.toThrow();
  });

  /** The household is client-supplied, and it names a cellar: asking through someone else's reads theirs. */
  test("rejects a cook asking through a household they do not belong to", async () => {
    const stranger = await seedUser("Stranger");
    const { userId } = await seedUser("Franck");

    await expect(ask({ userId, householdId: stranger.householdId }, "salut")).rejects.toThrow(/FORBIDDEN/);
  });

  test("refuses a cook who has hit their rate limit, and saves and schedules nothing", async () => {
    const cook = await seedUser("Franck");
    const { threadId } = await ask(cook, "salut");
    for (let spent = 1; spent < RATE_LIMITS.assistant.capacity; spent++) {
      await t.run((ctx) => enforceRateLimit({ ...ctx, userId: cook.userId, user: { role: "USER" } }, "assistant"));
    }
    const saved = await messagesOf(threadId);
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

    await expect(ask(cook, "encore", threadId)).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });

    expect(await messagesOf(threadId)).toEqual(saved);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(scheduled.length);
  });

  test("hands the household's cellar and the cook's clock to the answer", async () => {
    const cook = await seedUser("Franck");
    await t.run(async (ctx) => {
      const ingredientId = await ctx.db.insert("ingredients", {
        name: { values: { fr: "tomate", en: "tomato" }, meta: {} },
        category: "VEGETABLE",
        emoji: "🍅",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      });
      await ctx.db.insert("cellarItems", { householdId: cook.householdId, ingredientId, quantity: 6, unit: "pcs", updatedAt: Date.now() });
    });

    await ask(cook, "Je fais quoi ce soir ?");

    const [scheduled] = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const { brief } = scheduled?.args[0] as { brief: string };
    expect(brief).toContain("tomate");
    expect(brief).toMatch(/<now>Thursday 2026-09-24 19:05<\/now>$/);
  });

  test("opens a thread when the caller has none, and saves the question in it", async () => {
    const cook = await seedUser("Franck");

    const { threadId } = await ask(cook, "Je fais quoi ce soir ?");

    expect(threadId).toBeTruthy();
    expect(await messagesOf(threadId)).toContain("Je fais quoi ce soir ?");
  });

  test("continues a warm thread rather than opening a second one", async () => {
    const cook = await seedUser("Franck");

    const first = await ask(cook, "Je fais quoi ce soir ?");
    const second = await ask(cook, "Et sans crème ?", first.threadId);

    expect(second.threadId).toBe(first.threadId);
    expect(await messagesOf(first.threadId)).toHaveLength(2);
  });

  /**
   * The idle window, enforced where it counts. The client makes the same comparison so it does not
   * DRAW a cold conversation, but that runs on a phone's clock — this is the one that decides what
   * actually gets appended to, so a client that was backgrounded for an hour cannot talk its way
   * back into a conversation that has closed.
   *
   * The old thread keeps its message: nothing is deleted when a conversation ages out, which is
   * the half of this that a test is the only place to state.
   */
  test("opens a new thread once the old one has been idle past the window", async () => {
    vi.useFakeTimers();

    const cook = await seedUser("Franck");
    const first = await ask(cook, "Je fais quoi ce soir ?");

    vi.setSystemTime(Date.now() + ASSISTANT_IDLE_MS + 1);

    const second = await ask(cook, "Et demain ?", first.threadId);

    expect(second.threadId).not.toBe(first.threadId);
    expect(await messagesOf(second.threadId)).toEqual(["Et demain ?"]);
    expect(await messagesOf(first.threadId)).toEqual(["Je fais quoi ce soir ?"]);
  });

  /**
   * ⚠️ A `threadId` is a client-supplied string naming somebody's private conversation, and no
   * builder can guard it — a thread is not a row in one of our tables. Continuing another cook's
   * thread would both leak their conversation into the answer's context and write into it. The
   * offered id is ignored and a fresh thread opened, which is the same answer `ownedThread` gives
   * for an id that simply does not exist.
   */
  test("refuses to continue another cook's thread, silently opening its own", async () => {
    const stranger = await seedUser("Stranger");
    const theirs = await ask(stranger, "Ma bolognaise secrète");
    const cook = await seedUser("Franck");

    const mine = await ask(cook, "Je fais quoi ce soir ?", theirs.threadId);

    expect(mine.threadId).not.toBe(theirs.threadId);
    expect(await messagesOf(theirs.threadId)).toEqual(["Ma bolognaise secrète"]);
  });

  /** A threadId from another deployment, or an older build. Not an error — just not a thread. */
  test("opens a new thread when the offered id is not a thread at all", async () => {
    const cook = await seedUser("Franck");

    const { threadId } = await ask(cook, "Je fais quoi ce soir ?", "not-an-id");

    expect(await messagesOf(threadId)).toEqual(["Je fais quoi ce soir ?"]);
  });

  test("saves the photo ahead of the words, as a file part", async () => {
    const cook = await seedUser("Franck");
    const imageId = await seedImage(cook.userId);

    const { threadId } = await ask(cook, "Je fais quoi avec ça ?", undefined, imageId);

    expect(await lastContentOf(threadId)).toEqual([
      { type: "file", data: "https://bucket.example/shelf.webp", mediaType: "image/webp" },
      { type: "text", text: "Je fais quoi avec ça ?" },
    ]);
  });

  /** An image id names a row anyone could guess or be given: only the one who uploaded it may attach it. */
  test("rejects a photo another cook uploaded", async () => {
    const stranger = await seedUser("Stranger");
    const theirs = await seedImage(stranger.userId);
    const cook = await seedUser("Franck");

    await expect(ask(cook, "Et ça ?", undefined, theirs)).rejects.toThrow(/FORBIDDEN/);
  });

  test("rejects a photo that no longer exists", async () => {
    const cook = await seedUser("Franck");
    const imageId = await seedImage(cook.userId);
    await t.run((ctx) => ctx.db.delete(imageId));

    await expect(ask(cook, "Et ça ?", undefined, imageId)).rejects.toThrow(/FORBIDDEN/);
  });
});
