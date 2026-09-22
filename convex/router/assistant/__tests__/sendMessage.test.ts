import agentTest, { register as registerAgent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { ASSISTANT_IDLE_MS } from "../../../../shared/assistant";
import { assistantAgent } from "../../../agent/agents";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
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
  ]),
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

const ask = (userId: Id<"users">, text: string, threadId?: string) =>
  t
    .withIdentity(asUser(userId))
    .mutation(api.router.assistant.sendMessage.authed, { text, threadId, locale: "fr" });

const messagesOf = (threadId: string) =>
  t.run(async (ctx) => {
    const { page } = await assistantAgent.listMessages(ctx, {
      threadId,
      paginationOpts: { numItems: 20, cursor: null },
    });

    return page.map((message) => message.text);
  });

beforeEach(() => {
  t = convexTest(schema, modules);
  registerAgent(t);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("router/assistant/sendMessage", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(
      t.mutation(api.router.assistant.sendMessage.authed, { text: "salut", locale: "fr" }),
    ).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t
        .withIdentity(asUser(ghost))
        .mutation(api.router.assistant.sendMessage.authed, { text: "salut", locale: "fr" }),
    ).rejects.toThrow();
  });

  test("opens a thread when the caller has none, and saves the question in it", async () => {
    const userId = await seedUser("Franck");

    const { threadId } = await ask(userId, "Je fais quoi ce soir ?");

    expect(threadId).toBeTruthy();
    expect(await messagesOf(threadId)).toContain("Je fais quoi ce soir ?");
  });

  test("continues a warm thread rather than opening a second one", async () => {
    const userId = await seedUser("Franck");

    const first = await ask(userId, "Je fais quoi ce soir ?");
    const second = await ask(userId, "Et sans crème ?", first.threadId);

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

    const userId = await seedUser("Franck");
    const first = await ask(userId, "Je fais quoi ce soir ?");

    vi.setSystemTime(Date.now() + ASSISTANT_IDLE_MS + 1);

    const second = await ask(userId, "Et demain ?", first.threadId);

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
    const strangerId = await seedUser("Stranger");
    const theirs = await ask(strangerId, "Ma bolognaise secrète");
    const userId = await seedUser("Franck");

    const mine = await ask(userId, "Je fais quoi ce soir ?", theirs.threadId);

    expect(mine.threadId).not.toBe(theirs.threadId);
    expect(await messagesOf(theirs.threadId)).toEqual(["Ma bolognaise secrète"]);
  });

  /** A threadId from another deployment, or an older build. Not an error — just not a thread. */
  test("opens a new thread when the offered id is not a thread at all", async () => {
    const userId = await seedUser("Franck");

    const { threadId } = await ask(userId, "Je fais quoi ce soir ?", "not-an-id");

    expect(await messagesOf(threadId)).toEqual(["Je fais quoi ce soir ?"]);
  });
});
