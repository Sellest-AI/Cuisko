import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/cellars/removeGroceryProduct."))
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

const seedProduct = (t: ReturnType<typeof convexTest>, householdId: Id<"households">) =>
  t.run((ctx) =>
    ctx.db.insert("groceryProducts", {
      householdId,
      name: "shampoo",
      nameKey: "shampoo",
      emoji: "📦",
      unit: "pcs",
      quantity: 2,
      updatedAt: Date.now(),
    }),
  );

describe("router/cellars/removeGroceryProduct", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedMember(t, "Franck", "ABC123");
    const productId = await seedProduct(t, householdId);

    await expect(t.mutation(api.router.cellars.removeGroceryProduct.authed, { householdId, productId })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(productId))).not.toBeNull();
  });

  test("rejects a caller outside the household", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedMember(t, "Franck", "ABC123");
    const stranger = await seedMember(t, "Camille", "DEF456");
    const productId = await seedProduct(t, householdId);

    await expect(
      t.withIdentity(asUser(stranger.userId)).mutation(api.router.cellars.removeGroceryProduct.authed, { householdId, productId }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(productId))).not.toBeNull();
  });

  /** Membership of B proves nothing about a row of A: the builder checks the id passed, not the row's. */
  test("rejects a member of one household naming another household's product", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedMember(t, "Franck", "ABC123");
    const other = await seedMember(t, "Camille", "DEF456");
    const productId = await seedProduct(t, owner.householdId);

    await expect(
      t
        .withIdentity(asUser(other.userId))
        .mutation(api.router.cellars.removeGroceryProduct.authed, { householdId: other.householdId, productId }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(productId))).not.toBeNull();
  });

  test("removes the row, reports it, and writes nothing to the cellar or recently used", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const productId = await seedProduct(t, householdId);
    capture.mockReset();

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeGroceryProduct.authed, { householdId, productId });

    expect(await t.run((ctx) => ctx.db.get(productId))).toBeNull();
    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      {
        distinctId: userId,
        event: "grocery product removed",
        groups: { household: householdId },
        properties: { groceryProductId: productId },
      },
    ]);

    const others = await t.run(async (ctx) => [
      ...(await ctx.db.query("cellarItems").collect()),
      ...(await ctx.db.query("recentlyUsedIngredients").collect()),
    ]);
    expect(others).toEqual([]);
  });

  /** Two members in the same aisle: the second tap finds nothing, and neither is told off. */
  test("a second call is a no-op with no event", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const productId = await seedProduct(t, householdId);
    const asMember = t.withIdentity(asUser(userId));

    await asMember.mutation(api.router.cellars.removeGroceryProduct.authed, { householdId, productId });
    capture.mockReset();

    await expect(
      asMember.mutation(api.router.cellars.removeGroceryProduct.authed, { householdId, productId }),
    ).resolves.toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });
});
