import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

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
      .filter(([path]) => path.startsWith("/convex/router/households/getMine."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const seedUser = (t: ReturnType<typeof convexTest>, name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    return userId;
  });

const seedHousehold = (t: ReturnType<typeof convexTest>, name: string, inviteCode: string) =>
  t.run((ctx) =>
    ctx.db.insert("households", { name, equipments: [], inviteCode, updatedAt: Date.now() }),
  );

const addMember = (
  t: ReturnType<typeof convexTest>,
  householdId: Awaited<ReturnType<typeof seedHousehold>>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) => t.run((ctx) => ctx.db.insert("householdUsers", { householdId, userId }));

describe("router/households/getMine", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.router.households.getMine.authed, {})).rejects.toThrow();
  });

  test("returns the households the caller belongs to", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const homeId = await seedHousehold(t, "Home", "ABC123");
    await addMember(t, homeId, userId);

    const households = await t.withIdentity(asUser(userId)).query(api.router.households.getMine.authed, {});

    expect(households.map((household) => household._id)).toEqual([homeId]);
    expect(households.map((household) => household.name)).toEqual(["Home"]);
  });

  test("returns nothing for a signed-in user who belongs to no household", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Newcomer");
    await seedHousehold(t, "Someone else's", "ABC123");

    expect(await t.withIdentity(asUser(userId)).query(api.router.households.getMine.authed, {})).toEqual([]);
  });

  test("never returns another user's household", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const outsiderId = await seedUser(t, "Outsider");
    const mineId = await seedHousehold(t, "Mine", "ABC123");
    const theirsId = await seedHousehold(t, "Theirs", "XYZ789");
    await addMember(t, mineId, userId);
    await addMember(t, theirsId, outsiderId);

    const households = await t.withIdentity(asUser(userId)).query(api.router.households.getMine.authed, {});

    expect(households.map((household) => household._id)).toEqual([mineId]);
  });

  test("orders by when the caller joined, so reading [0] is stable across reads", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const firstId = await seedHousehold(t, "First", "ABC123");
    const secondId = await seedHousehold(t, "Second", "XYZ789");
    await addMember(t, firstId, userId);
    await addMember(t, secondId, userId);

    const households = await t.withIdentity(asUser(userId)).query(api.router.households.getMine.authed, {});

    expect(households.map((household) => household._id)).toEqual([firstId, secondId]);
  });

  test("skips a membership whose household has been deleted", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const goneId = await seedHousehold(t, "Gone", "ABC123");
    const homeId = await seedHousehold(t, "Home", "XYZ789");
    await addMember(t, goneId, userId);
    await addMember(t, homeId, userId);
    await t.run((ctx) => ctx.db.delete(goneId));

    const households = await t.withIdentity(asUser(userId)).query(api.router.households.getMine.authed, {});

    expect(households.map((household) => household._id)).toEqual([homeId]);
  });
});
