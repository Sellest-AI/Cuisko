import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
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
      .filter(([path]) => path.startsWith("/convex/router/cellars/addGroceryProduct."))
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

const allRows = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("groceryProducts").collect());

describe("router/cellars/addGroceryProduct", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedMember(t, "Franck", "ABC123");

    await expect(
      t.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "shampoo", unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
  });

  test("rejects a caller outside the household", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedMember(t, "Franck", "ABC123");
    const stranger = await seedMember(t, "Camille", "DEF456");

    await expect(
      t
        .withIdentity(asUser(stranger.userId))
        .mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "shampoo", unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
    expect(await allRows(t)).toEqual([]);
  });

  test("stores the name, the box, the quantity and the unit, and reports no name", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    capture.mockReset();

    const landed = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "shampoo", unit: "pcs", quantity: 2 });

    expect(await allRows(t)).toMatchObject([
      { householdId, name: "shampoo", nameKey: "shampoo", emoji: "📦", unit: "pcs", quantity: 2 },
    ]);
    expect(landed.merged).toBe(false);
    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      {
        distinctId: userId,
        event: "grocery product added",
        groups: { household: householdId },
        properties: { groceryProductId: landed.id, merged: false },
      },
    ]);
  });

  test("merges the same name in another case and accent, and raises the card", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const asMember = t.withIdentity(asUser(userId));

    const productId = await t.run((ctx) =>
      ctx.db.insert("groceryProducts", {
        householdId,
        name: "crème solaire",
        nameKey: "creme solaire",
        emoji: "📦",
        unit: "pcs",
        quantity: 1,
        updatedAt: 1000,
      }),
    );

    const landed = await asMember.mutation(api.router.cellars.addGroceryProduct.authed, {
      householdId,
      name: "Creme  Solaire",
      unit: "pcs",
      quantity: 2,
    });

    const rows = await allRows(t);
    expect(landed).toEqual({ id: productId, merged: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "crème solaire", quantity: 3 });
    expect(rows[0]!.updatedAt).toBeGreaterThan(1000);
  });

  test("another unit opens a second row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const asMember = t.withIdentity(asUser(userId));

    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "laundry detergent", unit: "l", quantity: 1 });
    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "laundry detergent", unit: "ml", quantity: 500 });

    expect(await allRows(t)).toHaveLength(2);
  });

  test.each([
    ["de shampoing", "shampoing"],
    ["du savon", "savon"],
    ["des éponges", "éponges"],
    ["of bleach", "bleach"],
    ["d'adoucissant", "adoucissant"],
    ["d’adoucissant", "adoucissant"],
    ["de la lessive", "lessive"],
    ["de l'eau de javel", "eau de javel"],
    ["de l’eau de javel", "eau de javel"],
  ])("takes the partitive off %j", async (typed, stored) => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: typed, unit: "pcs", quantity: 1 });

    expect(await allRows(t)).toMatchObject([{ name: stored }]);
  });

  test("a partitive and a bare word are one row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const asMember = t.withIdentity(asUser(userId));

    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "adoucissant", unit: "pcs", quantity: 1 });
    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "d’adoucissant", unit: "pcs", quantity: 1 });

    expect(await allRows(t)).toMatchObject([{ name: "adoucissant", quantity: 2 }]);
  });

  test("a hyphen and a space are one row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const asMember = t.withIdentity(asUser(userId));

    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "essuie-tout", unit: "pcs", quantity: 1 });
    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "essuie tout", unit: "pcs", quantity: 1 });

    expect(await allRows(t)).toMatchObject([{ name: "essuie-tout", quantity: 2 }]);
  });

  /** The fold keeps a-z and 0-9, so without a fallback these would all share an empty key. */
  test("names the fold reduces to nothing stay apart", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const asMember = t.withIdentity(asUser(userId));

    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "洗发水", unit: "pcs", quantity: 1 });
    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "牙膏", unit: "pcs", quantity: 1 });

    expect(await allRows(t)).toHaveLength(2);
  });

  test("the two apostrophes a keyboard can type are one row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");
    const asMember = t.withIdentity(asUser(userId));

    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "l'oréal elseve", unit: "pcs", quantity: 1 });
    await asMember.mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "l’oréal elseve", unit: "pcs", quantity: 1 });

    expect(await allRows(t)).toMatchObject([{ name: "l'oréal elseve", quantity: 2 }]);
  });

  test.each(["l'oréal elseve", "le chat", "la croix", "desodorisant", "dentifrice"])("keeps %j whole", async (typed) => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: typed, unit: "pcs", quantity: 1 });

    expect(await allRows(t)).toMatchObject([{ name: typed }]);
  });

  test.each(["", "   ", "de", "d'", "x".repeat(81)])("rejects the name %j", async (name) => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name, unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
    expect(await allRows(t)).toEqual([]);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects the quantity %d", async (quantity) => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "soap", unit: "pcs", quantity }),
    ).rejects.toThrow();
    expect(await allRows(t)).toEqual([]);
  });

  test("writes no ingredient, cellar, list or recently-used row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedMember(t, "Franck", "ABC123");

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addGroceryProduct.authed, { householdId, name: "shampoo", unit: "pcs", quantity: 1 });

    const others = await t.run(async (ctx) => [
      ...(await ctx.db.query("ingredients").collect()),
      ...(await ctx.db.query("cellarItems").collect()),
      ...(await ctx.db.query("groceryListItems").collect()),
      ...(await ctx.db.query("recentlyUsedIngredients").collect()),
    ]);
    expect(others).toEqual([]);
  });
});
