import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";
import { modules } from "@convex/lib/__tests__/modules.fixtures";

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/cellars/getGroceryProducts."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const seedMember = (t: ReturnType<typeof convexTest>, name: string, inviteCode: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name, email: `${name}@example.com` });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", {
      name: "Home",
      equipments: [],
      inviteCode,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("householdUsers", { householdId, userId });

    return { userId, householdId };
  });

describe("router/cellars/getGroceryProducts", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedMember(t, "Franck", "ABC123");

    await expect(t.query(api.router.cellars.getGroceryProducts.authed, { householdId })).rejects.toThrow();
  });

  test("rejects a caller outside the household", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedMember(t, "Franck", "ABC123");
    const stranger = await seedMember(t, "Camille", "DEF456");

    await expect(
      t.withIdentity(asUser(stranger.userId)).query(api.router.cellars.getGroceryProducts.authed, { householdId }),
    ).rejects.toThrow();
  });

  test("gives a member the household's products and nobody else's", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const other = await seedMember(t, "Camille", "DEF456");

    await t.run(async (ctx) => {
      await ctx.db.insert("groceryProducts", {
        householdId,
        name: "shampoo",
        nameKey: "shampoo",
        emoji: "📦",
        unit: "pcs",
        quantity: 2,
        updatedAt: 1000,
      });
      await ctx.db.insert("groceryProducts", {
        householdId: other.householdId,
        name: "toothpaste",
        nameKey: "toothpaste",
        emoji: "📦",
        unit: "pcs",
        quantity: 1,
        updatedAt: 1000,
      });
    });

    const products = await t
      .withIdentity(asUser(userId))
      .query(api.router.cellars.getGroceryProducts.authed, { householdId });

    expect(products).toMatchObject([{ name: "shampoo", emoji: "📦", unit: "pcs", quantity: 2, updatedAt: 1000 }]);
  });
});
