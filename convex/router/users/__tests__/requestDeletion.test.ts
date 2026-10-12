import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { ACCOUNT_DELETION_GRACE_MS } from "@shared/accountDeletion";

import { api } from "../../../_generated/api";
import { REVIEW_ACCOUNT } from "../../../functions/auth/reviewAccount";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see getMe.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/users/requestDeletion."))
      .map(([, load]) => load()),
  ),
);

/**
 * Every request schedules the purge 30 days out, and convex-test runs a scheduled job on Node's
 * `setTimeout`, which cannot wait that long: it fires after 1ms instead, mid-test. Fake timers keep
 * the job scheduled and never run, which is what these tests assert about it.
 */
beforeEach(() => {
  vi.useFakeTimers();
  capture.mockReset();
});
afterEach(() => vi.useRealTimers());

/** What each test reports to analytics: the client is mocked, so nothing is sent or scheduled. */
const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));
/** The account events captured, as `[event, properties]`. */
const accountEvents = () =>
  capture.mock.calls.map(([, { event, properties }]) => [event, properties] as [string, Record<string, unknown>]);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const newDeployment = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof newDeployment>;

const seedUser = async (
  t: TestConvex,
  fields: { email?: string; deletionDueAt?: number; deletedAt?: number } = {},
) =>
  t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Franck", email: fields.email ?? "f@example.com" });
    await ctx.db.insert("usersExtended", {
      userId: id,
      role: "USER",
      deletionDueAt: fields.deletionDueAt,
      deletedAt: fields.deletedAt,
      updatedAt: Date.now(),
    });
    return id;
  });

const extendedOf = (t: TestConvex, userId: Awaited<ReturnType<typeof seedUser>>) =>
  t.run((ctx) =>
    ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
  );

describe("router/users/requestDeletion", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = newDeployment();

    await expect(t.mutation(api.router.users.requestDeletion.authed, {})).rejects.toThrow();
  });

  test("rejects an anonymized account that still holds a session", async () => {
    const t = newDeployment();
    const userId = await seedUser(t, { deletedAt: Date.now() });

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {}),
    ).rejects.toThrow();
  });

  test("sets the date 30 days out, and answers with it", async () => {
    const t = newDeployment();
    const userId = await seedUser(t);

    const before = Date.now();
    const dueAt = await t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {});
    const after = Date.now();

    expect(dueAt).toBeGreaterThanOrEqual(before + ACCOUNT_DELETION_GRACE_MS);
    expect(dueAt).toBeLessThanOrEqual(after + ACCOUNT_DELETION_GRACE_MS);
    expect((await extendedOf(t, userId))?.deletionDueAt).toBe(dueAt);
  });

  /** A retry after a lost response must not push the date back. */
  test("asking again while pending returns the same date and writes nothing", async () => {
    const t = newDeployment();
    const userId = await seedUser(t);
    const caller = t.withIdentity(asUser(userId));

    const first = await caller.mutation(api.router.users.requestDeletion.authed, {});
    const rowAfterFirst = await extendedOf(t, userId);
    const second = await caller.mutation(api.router.users.requestDeletion.authed, {});

    expect(second).toBe(first);
    expect(await extendedOf(t, userId)).toEqual(rowAfterFirst);
  });

  test("schedules the purge for the due date, once, however often it is asked", async () => {
    const t = newDeployment();
    const userId = await seedUser(t);
    const caller = t.withIdentity(asUser(userId));

    const dueAt = await caller.mutation(api.router.users.requestDeletion.authed, {});
    await caller.mutation(api.router.users.requestDeletion.authed, {});

    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: "router/users/purge:_internal",
      args: [{ userId }],
      scheduledTime: dueAt,
    });
  });

  /**
   * A date already past means the purge ran and failed, or never ran: no job is waiting for it. Only
   * asking again can recover, so asking again starts over rather than answering with a dead date.
   * It only happens when the cook asks, so a purge that keeps failing cannot loop on its own.
   */
  test("starts over when the previous date has passed, with a new date and a new job", async () => {
    const t = newDeployment();
    const userId = await seedUser(t, { deletionDueAt: Date.now() - 1000 });

    const before = Date.now();
    const dueAt = await t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {});

    expect(dueAt).toBeGreaterThanOrEqual(before + ACCOUNT_DELETION_GRACE_MS);
    expect((await extendedOf(t, userId))?.deletionDueAt).toBe(dueAt);

    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ name: "router/users/purge:_internal", scheduledTime: dueAt });
  });

  /** App Review tries this flow with the shared account, so it must work there like anywhere else. */
  test("lets the store reviewer's shared account ask too", async () => {
    const t = newDeployment();
    const userId = await seedUser(t, { email: REVIEW_ACCOUNT.email });

    const dueAt = await t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {});

    expect((await extendedOf(t, userId))?.deletionDueAt).toBe(dueAt);
  });

  test("only ever touches the caller's own account", async () => {
    const t = newDeployment();
    const caller = await seedUser(t);
    const other = await seedUser(t, { email: "other@example.com" });

    await t.withIdentity(asUser(caller)).mutation(api.router.users.requestDeletion.authed, {});

    expect((await extendedOf(t, other))?.deletionDueAt).toBeUndefined();
  });

  describe("analytics", () => {
    test("reports a new request once, with its due date and the account's age", async () => {
      const t = newDeployment();
      const userId = await seedUser(t);

      const dueAt = await t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {});

      expect(accountEvents()).toEqual([["account deletion requested", { accountAgeDays: 0, deletionDueAt: dueAt }]]);
      expect(capture.mock.calls[0]![1].distinctId).toBe(userId);
    });

    /** A retry after a lost response is not a second cook leaving. */
    test("does not report asking again while a request is pending", async () => {
      const t = newDeployment();
      const caller = t.withIdentity(asUser(await seedUser(t)));

      await caller.mutation(api.router.users.requestDeletion.authed, {});
      await caller.mutation(api.router.users.requestDeletion.authed, {});

      expect(accountEvents()).toHaveLength(1);
    });
  });
});
