import agentTest, { register as registerAgent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

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
 * `registerAgent` hands to convex-test as-is. Without warming it too, the first test to touch a
 * thread pays for the whole component graph — 200ms idle, and past the 5s budget under a full
 * `pnpm verify` with Metro running.
 */
beforeAll(() =>
  Promise.all([
    ...Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/assistant/listMessages."))
      .map(([, load]) => load()),
    ...Object.values(agentTest.modules).map((load) => load()),
  ]),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const FIRST_PAGE = { numItems: 10, cursor: null };

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

/** A thread with one message in it, owned by `userId`. */
const seedThread = async (userId: Id<"users">, text: string) => {
  const { threadId } = await t.run((ctx) => assistantAgent.createThread(ctx, { userId }));

  await t.run((ctx) =>
    assistantAgent.saveMessage(ctx, { threadId, userId, prompt: text, skipEmbeddings: true }),
  );

  return threadId;
};

beforeEach(() => {
  t = convexTest(schema, modules);
  /**
   * Threads and messages live in the agent component, not in our schema, so the harness has to be
   * told about it — without this every read through `assistantAgent` fails with "Component agent
   * is not registered", which looks like a bug in the code under test and is not.
   */
  registerAgent(t);
});

describe("router/assistant/listMessages", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(
      t.query(api.router.assistant.listMessages.authed, {
        threadId: "whatever",
        paginationOpts: FIRST_PAGE,
      }),
    ).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t.withIdentity(asUser(ghost)).query(api.router.assistant.listMessages.authed, {
        threadId: "whatever",
        paginationOpts: FIRST_PAGE,
      }),
    ).rejects.toThrow();
  });

  test("returns the caller's own conversation", async () => {
    const userId = await seedUser("Franck");
    const threadId = await seedThread(userId, "Je fais quoi ce soir ?");

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.assistant.listMessages.authed, { threadId, paginationOpts: FIRST_PAGE });

    expect(page).toHaveLength(1);
    expect(page[0]?.text).toBe("Je fais quoi ce soir ?");
  });

  /**
   * ⚠️ **The assertion this whole file exists for.** A thread lives in the agent component, not in
   * one of our tables, so `ownedQuery` cannot guard it and no C-check can see the hole — the
   * ownership comparison is written by hand in `functions/assistant/ownedThread.ts` and this is
   * what proves it is still wired up. Without it, any signed-in cook holding a thread id reads
   * somebody else's private conversation, and nothing anywhere would say so.
   *
   * It matters more since threads stopped being deleted: a leaked id used to go stale within
   * fifteen minutes, and now it does not go stale at all.
   */
  test("answers empty for another cook's conversation", async () => {
    const strangerId = await seedUser("Stranger");
    const theirThread = await seedThread(strangerId, "Ma bolognaise secrète");
    const userId = await seedUser("Franck");

    const { page } = await t
      .withIdentity(asUser(userId))
      .query(api.router.assistant.listMessages.authed, {
        threadId: theirThread,
        paginationOpts: FIRST_PAGE,
      });

    expect(page).toEqual([]);
  });

  /**
   * The ordinary case, not an error: a client holds a thread id across an app restart, or simply
   * one the server has moved past. The modal must open ready for a new question rather than
   * showing a failure — and answering identically to the test above is also what stops this
   * telling an attacker which ids are real.
   */
  test("answers empty for a thread that does not exist, rather than throwing", async () => {
    const userId = await seedUser("Franck");

    const { page, isDone } = await t
      .withIdentity(asUser(userId))
      .query(api.router.assistant.listMessages.authed, {
        threadId: "a-thread-that-never-was",
        paginationOpts: FIRST_PAGE,
      });

    expect(page).toEqual([]);
    expect(isDone).toBe(true);
  });
});
