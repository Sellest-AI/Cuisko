import { convexTest, type TestConvex } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/households/create."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: TestConvex<typeof schema>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const seedUser = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Cook" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    return userId;
  });

const currentOf = (userId: Id<"users">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first())
      ?.currentHouseholdId,
  );

describe("router/households/create", () => {
  test("rejects an unauthenticated caller", async () => {
    await expect(t.mutation(api.router.households.create.authed, {})).rejects.toThrow();
  });

  test("creates a House with the caller in it, and makes it current", async () => {
    const userId = await seedUser();

    const householdId = await t.withIdentity(asUser(userId)).mutation(api.router.households.create.authed, {});

    const household = await t.run((ctx) => ctx.db.get(householdId));
    const members = await t.run((ctx) =>
      ctx.db.query("householdUsers").withIndex("by_household", (q) => q.eq("householdId", householdId)).collect(),
    );

    expect(household?.name).toBe("House");
    expect(household?.inviteCode).toHaveLength(8);
    expect(members.map((member) => member.userId)).toEqual([userId]);
    expect(await currentOf(userId)).toBe(householdId);
  });
});
