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
      .filter(([path]) => path.startsWith("/convex/router/households/select."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: TestConvex<typeof schema>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const seedUser = (currentHouseholdId?: Id<"households">) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Cook" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", currentHouseholdId, updatedAt: Date.now() });
    return userId;
  });

const seedHousehold = (inviteCode: string) =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode, updatedAt: Date.now() }));

const addMember = (householdId: Id<"households">, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.insert("householdUsers", { householdId, userId }));

const currentOf = (userId: Id<"users">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first())
      ?.currentHouseholdId ?? null,
  );

describe("router/households/select", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold("ABCDEFGH");

    await expect(t.mutation(api.router.households.select.authed, { householdId })).rejects.toThrow();
  });

  test("rejects a household the caller is not in", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser();

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.households.select.authed, { householdId }),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(await currentOf(userId)).toBeNull();
  });

  test("makes a household the caller is in the current one", async () => {
    const homeId = await seedHousehold("HJKMNPQR");
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser(homeId);
    await addMember(homeId, userId);
    await addMember(householdId, userId);

    await t.withIdentity(asUser(userId)).mutation(api.router.households.select.authed, { householdId });

    expect(await currentOf(userId)).toBe(householdId);
  });
});
