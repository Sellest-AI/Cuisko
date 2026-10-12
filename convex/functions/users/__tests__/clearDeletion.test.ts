import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { clearDeletion } from "../clearDeletion";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Warms `auth.ts` before anything is timed: the sign-in tests go through its `store` (C10). */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/auth."))
      .map(([, load]) => load()),
  ),
);

/** What each test reports to analytics: the client is mocked, so nothing is sent or scheduled. */
const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));
/** The account events captured, as `[event, properties]`. */
const accountEvents = () =>
  capture.mock.calls.map(([, { event, properties }]) => [event, properties] as [string, Record<string, unknown>]);
beforeEach(() => capture.mockReset());

const newDeployment = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof newDeployment>;

const seedUser = (t: TestConvex, fields: { deletionDueAt?: number; updatedAt?: number } = {}) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", {
      userId,
      role: "USER",
      deletionDueAt: fields.deletionDueAt,
      updatedAt: fields.updatedAt ?? Date.now(),
    });
    return userId;
  });

const extendedOf = (t: TestConvex, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first());

/**
 * A sign-in as @convex-dev/auth performs it once the provider has vouched for the person: the
 * library's own `store` mutation, which creates the session and calls `beforeSessionCreation` on the
 * way. `generateTokens: false` skips the JWT, which needs signing keys a test has no use for.
 */
const signIn = (t: TestConvex, userId: Id<"users">) =>
  t.mutation(internal.auth.store, { args: { type: "signIn", userId, generateTokens: false } });

describe("functions/users/clearDeletion", () => {
  test("cancels a pending deletion", async () => {
    const t = newDeployment();
    const userId = await seedUser(t, { deletionDueAt: Date.now() + 1000 });

    await t.run((ctx) => clearDeletion(ctx, userId));

    expect((await extendedOf(t, userId))?.deletionDueAt).toBeUndefined();
  });

  test("writes nothing when no deletion is pending", async () => {
    const t = newDeployment();
    const userId = await seedUser(t, { updatedAt: 1 });

    await t.run((ctx) => clearDeletion(ctx, userId));

    expect((await extendedOf(t, userId))?.updatedAt).toBe(1);
  });

  test("does nothing for an account with no extended row", async () => {
    const t = newDeployment();
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    await t.run((ctx) => clearDeletion(ctx, userId));

    expect(await extendedOf(t, userId)).toBeNull();
  });

  describe("analytics", () => {
    /** Coming back on day 1 and on day 29 are different stories; `daysLeft` tells them apart. */
    test("reports a cancellation with the days that were left", async () => {
      const t = newDeployment();
      const userId = await seedUser(t, { deletionDueAt: Date.now() + 3 * 24 * 60 * 60 * 1000 - 1000 });

      await t.run((ctx) => clearDeletion(ctx, userId));

      expect(accountEvents()).toEqual([["account deletion cancelled", { accountAgeDays: 0, daysLeft: 3 }]]);
      expect(capture.mock.calls[0]![1].distinctId).toBe(userId);
    });

    test("reports nothing for an ordinary sign-in", async () => {
      const t = newDeployment();
      const userId = await seedUser(t);

      await t.run((ctx) => clearDeletion(ctx, userId));

      expect(capture).not.toHaveBeenCalled();
    });
  });

  describe("wired into sign-in", () => {
    test("signing in cancels a pending deletion", async () => {
      const t = newDeployment();
      const userId = await seedUser(t, { deletionDueAt: Date.now() + 1000 });

      await signIn(t, userId);

      expect((await extendedOf(t, userId))?.deletionDueAt).toBeUndefined();
    });

    test("an ordinary sign-in leaves the account as it was", async () => {
      const t = newDeployment();
      const userId = await seedUser(t, { updatedAt: 1 });

      await signIn(t, userId);

      const extended = await extendedOf(t, userId);
      expect(extended?.deletionDueAt).toBeUndefined();
      expect(extended?.updatedAt).toBe(1);
    });
  });
});
