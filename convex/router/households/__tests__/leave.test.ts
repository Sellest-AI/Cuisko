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
      .filter(([path]) => path.startsWith("/convex/router/households/leave."))
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

const seedCellarItem = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: "oignon", en: "onion" }, meta: {} },
      search: { fr: "oignon", en: "onion" },
      category: "OTHER",
      emoji: "🧅",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    return ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 1, updatedAt: Date.now() });
  });

const currentOf = (userId: Id<"users">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first())
      ?.currentHouseholdId,
  );

const membersOf = (householdId: Id<"households">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("householdUsers").withIndex("by_household", (q) => q.eq("householdId", householdId)).collect())
      .map((member) => member.userId),
  );

const formerMembersOf = (householdId: Id<"households">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("householdFormerMembers").withIndex("by_household_and_user", (q) => q.eq("householdId", householdId)).collect())
      .map((row) => row.userId),
  );

const leave = (userId: Id<"users">, householdId: Id<"households">) =>
  t.withIdentity(asUser(userId)).mutation(api.router.households.leave.authed, { householdId });

describe("router/households/leave", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold("ABCDEFGH");

    await expect(t.mutation(api.router.households.leave.authed, { householdId })).rejects.toThrow();
  });

  test("rejects a caller who is not a member", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser();

    await expect(leave(userId, householdId)).rejects.toThrow(/FORBIDDEN/);
  });

  test("refuses to let a cook leave their only household", async () => {
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser(householdId);
    await addMember(householdId, userId);

    await expect(leave(userId, householdId)).rejects.toThrow(/LAST_HOUSEHOLD/);
    expect(await membersOf(householdId)).toEqual([userId]);
  });

  test("turns the membership into a former-member row, and keeps the code while others remain", async () => {
    const homeId = await seedHousehold("HJKMNPQR");
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser(householdId);
    const otherId = await seedUser(householdId);
    await addMember(homeId, userId);
    await addMember(householdId, userId);
    await addMember(householdId, otherId);

    await leave(userId, householdId);

    expect(await membersOf(householdId)).toEqual([otherId]);
    expect(await formerMembersOf(householdId)).toEqual([userId]);
    expect((await t.run((ctx) => ctx.db.get(householdId)))?.inviteCode).toBe("ABCDEFGH");
    expect(await currentOf(userId)).toBe(homeId);
  });

  test("the last member out keeps the household and its cellar, and clears its code", async () => {
    const homeId = await seedHousehold("HJKMNPQR");
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser(householdId);
    await addMember(homeId, userId);
    await addMember(householdId, userId);
    const cellarItemId = await seedCellarItem(householdId);

    await leave(userId, householdId);

    const household = await t.run((ctx) => ctx.db.get(householdId));
    expect(household).not.toBeNull();
    expect(household?.inviteCode).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.get(cellarItemId))).not.toBeNull();
    expect(await formerMembersOf(householdId)).toEqual([userId]);
    expect(await currentOf(userId)).toBe(homeId);
  });

  /** Coming and going is one former member, not one row per trip. */
  test("joining and leaving again and again keeps a single former-member row", async () => {
    const homeId = await seedHousehold("HJKMNPQR");
    const householdId = await seedHousehold("ABCDEFGH");
    const userId = await seedUser(homeId);
    const otherId = await seedUser(householdId);
    await addMember(homeId, userId);
    await addMember(householdId, otherId);

    for (let trip = 0; trip < 3; trip++) {
      await t.withIdentity(asUser(userId)).mutation(api.router.households.join.authed, { code: "ABCDEFGH" });
      await leave(userId, householdId);
    }

    expect(await formerMembersOf(householdId)).toEqual([userId]);
    expect(await membersOf(householdId)).toEqual([otherId]);
  });

  test("leaving a household that is not the current one leaves current alone", async () => {
    const homeId = await seedHousehold("HJKMNPQR");
    const householdId = await seedHousehold("ABCDEFGH");
    const otherHomeId = await seedHousehold("STUVWXYZ");
    const userId = await seedUser(otherHomeId);
    await addMember(homeId, userId);
    await addMember(householdId, userId);
    await addMember(otherHomeId, userId);

    await leave(userId, householdId);

    expect(await currentOf(userId)).toBe(otherHomeId);
  });
});
