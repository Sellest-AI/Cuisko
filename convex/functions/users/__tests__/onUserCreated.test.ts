import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "../../../schema";
import { onUserCreated } from "../onUserCreated";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

describe("functions/users/onUserCreated", () => {
  test("a new account gets a household, and shops there from its first read", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    await t.run((ctx) => onUserCreated(ctx, userId));

    const { extended, households, memberships } = await t.run(async (ctx) => ({
      extended: await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      households: await ctx.db.query("households").collect(),
      memberships: await ctx.db.query("householdUsers").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    }));

    expect(households).toHaveLength(1);
    expect(households[0]?.name).toBe("House");
    expect(households[0]?.inviteCode).toHaveLength(8);
    expect(memberships.map((membership) => membership.householdId)).toEqual([households[0]?._id]);
    expect(extended?.role).toBe("USER");
    expect(extended?.currentHouseholdId).toBe(households[0]?._id);
  });

  /** The auth callback is not guaranteed to run once; a second run must not hand out a second household. */
  test("a second run for the same account creates nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    await t.run((ctx) => onUserCreated(ctx, userId));
    await t.run((ctx) => onUserCreated(ctx, userId));

    const counts = await t.run(async (ctx) => ({
      extended: (await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).collect()).length,
      households: (await ctx.db.query("households").collect()).length,
    }));

    expect(counts).toEqual({ extended: 1, households: 1 });
  });
});
