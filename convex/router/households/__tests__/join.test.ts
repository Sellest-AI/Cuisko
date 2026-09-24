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
      .filter(([path]) => path.startsWith("/convex/router/households/join."))
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

const seedHousehold = (inviteCode: string) =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode, updatedAt: Date.now() }));

const addMember = (householdId: Id<"households">, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.insert("householdUsers", { householdId, userId }));

const currentOf = (userId: Id<"users">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first())
      ?.currentHouseholdId,
  );

const join = (userId: Id<"users">, code: string) =>
  t.withIdentity(asUser(userId)).mutation(api.router.households.join.authed, { code });

describe("router/households/join", () => {
  test("rejects an unauthenticated caller", async () => {
    await seedHousehold("ABCDEFGH");

    await expect(t.mutation(api.router.households.join.authed, { code: "ABCDEFGH" })).rejects.toThrow();
  });

  test("rejects a code no household holds", async () => {
    const userId = await seedUser();

    await expect(join(userId, "ZZZZZZZZ")).rejects.toThrow(/NOT_FOUND/);
  });

  test("joins by a code typed in lower case with spaces, and makes it current", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser();

    await join(userId, " abcd efgh ");

    const membership = await t.run((ctx) =>
      ctx.db
        .query("householdUsers")
        .withIndex("by_household_and_user", (q) => q.eq("householdId", householdId).eq("userId", userId))
        .first(),
    );
    expect(membership).not.toBeNull();
    expect(await currentOf(userId)).toBe(householdId);
  });

  test("joining a household you are already in adds no second membership", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser();
    await addMember(householdId, userId);

    await join(userId, "ABCDEFGH");

    const memberships = await t.run((ctx) =>
      ctx.db.query("householdUsers").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    );
    expect(memberships).toHaveLength(1);
  });

  test("rejoining a household you left clears your former-member row", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser();
    await t.run((ctx) => ctx.db.insert("householdFormerMembers", { householdId, userId }));

    await join(userId, "ABCDEFGH");

    const former = await t.run((ctx) =>
      ctx.db
        .query("householdFormerMembers")
        .withIndex("by_household_and_user", (q) => q.eq("householdId", householdId).eq("userId", userId))
        .collect(),
    );
    expect(former).toEqual([]);
  });

  test("an emptied household's old code finds nothing", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    await t.run((ctx) => ctx.db.patch(householdId, { inviteCode: undefined }));
    const userId = await seedUser();

    await expect(join(userId, "ABCDEFGH")).rejects.toThrow(/NOT_FOUND/);
  });

  test("an empty code finds nothing, not the emptied households", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    await t.run((ctx) => ctx.db.patch(householdId, { inviteCode: undefined }));
    const userId = await seedUser();

    await expect(join(userId, "   ")).rejects.toThrow(/NOT_FOUND/);
  });
});
