import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import schema from "../../../schema";
import { loadCook } from "../loadCook";
import { modules } from "@convex/lib/__tests__/modules.fixtures";

/** Typed by the schema, so an index name is checked. */
type Test = TestConvex<typeof schema>;

const seedCook = (t: Test, fields: { deletedAt?: number } = {}) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Cook" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now(), ...fields });
    return userId;
  });

const seedHousehold = (t: Test, userId: Id<"users">, inviteCode: string) =>
  t.run(async (ctx) => {
    const householdId = await ctx.db.insert("households", { name: inviteCode, inviteCode, updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });
    return householdId;
  });

const selectHousehold = (t: Test, userId: Id<"users">, currentHouseholdId?: Id<"households">) =>
  t.run(async (ctx) => {
    const extended = await ctx.db
      .query("usersExtended")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    await ctx.db.patch(extended!._id, { currentHouseholdId });
  });

const load = (t: Test, userId: Id<"users">) =>
  t.run((ctx) => loadCook(ctx, { userId }));

describe("loadCook", () => {
  test("acts on the household the app shops for", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCook(t);
    await seedHousehold(t, userId, "OLDEST");
    const second = await seedHousehold(t, userId, "SECOND");
    await selectHousehold(t, userId, second);

    expect(await load(t, userId)).toEqual({ userId, role: "USER", householdId: second });
  });

  test("falls back to the oldest membership with no pointer", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCook(t);
    const oldest = await seedHousehold(t, userId, "OLDEST");
    await seedHousehold(t, userId, "SECOND");

    expect((await load(t, userId)).householdId).toBe(oldest);
  });

  test("falls back when the pointer names a household the cook left", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCook(t);
    const stranger = await seedCook(t);
    const left = await seedHousehold(t, stranger, "LEFT");
    const kept = await seedHousehold(t, userId, "KEPT");
    await selectHousehold(t, userId, left);

    expect((await load(t, userId)).householdId).toBe(kept);
  });

  test("refuses a cook with no household, in a sentence", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCook(t);

    await expect(load(t, userId)).rejects.toThrow(/no household/);
  });

  test("refuses an anonymized account", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCook(t, { deletedAt: Date.now() });
    await seedHousehold(t, userId, "KITCHEN");

    await expect(load(t, userId)).rejects.toThrow(/no longer exists/);
  });
});
