import { convexTest } from "convex-test";
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
      .filter(([path]) => path.startsWith("/convex/router/preferences/getPlanningSeed."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    return userId;
  });

const seedHousehold = () =>
  t.run((ctx) =>
    ctx.db.insert("households", {
      name: "Home",
      equipments: ["oven"],
      inviteCode: "ABC123",
      updatedAt: Date.now(),
    }),
  );

const join = (householdId: Id<"households">, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.insert("householdUsers", { householdId, userId }));

describe("router/preferences/getPlanningSeed", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold();

    await expect(
      t.query(api.router.preferences.getPlanningSeed.authed, { householdId }),
    ).rejects.toThrow();
  });

  /**
   * The membership check IS the authorization for this one: it reads other members' rows, so a
   * non-member reaching it would be reading a stranger's constraints off a household id.
   */
  test("rejects a caller who is not a member of the household", async () => {
    const householdId = await seedHousehold();
    const outsiderId = await seedUser("Outsider");

    await expect(
      t
        .withIdentity(asUser(outsiderId))
        .query(api.router.preferences.getPlanningSeed.authed, { householdId }),
    ).rejects.toThrow();
  });

  test("answers a member with their own row and the union of everybody else's", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser("Franck");
    const housemateId = await seedUser("Ana");
    await join(householdId, userId);
    await join(householdId, housemateId);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId,
        diet: "omnivore",
        avoids: ["milk"],
        seeks: ["high-protein"],
        updatedAt: Date.now(),
      });
      await ctx.db.insert("userPreferences", {
        userId: housemateId,
        diet: "vegan",
        avoids: ["gluten"],
        seeks: [],
        updatedAt: Date.now(),
      });
    });

    const seed = await t
      .withIdentity(asUser(userId))
      .query(api.router.preferences.getPlanningSeed.authed, { householdId });

    expect(seed.mine).toEqual({ diet: "omnivore", avoids: ["milk"], seeks: ["high-protein"] });
    expect(seed.others).toEqual({ diet: "vegan", avoids: ["gluten"] });
  });

  /** No argument names a user, so `others` cannot be recentred on somebody else by asking. */
  test("centres the seed on the caller rather than on any argument", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser("Franck");
    const housemateId = await seedUser("Ana");
    await join(householdId, userId);
    await join(householdId, housemateId);
    await t.run((ctx) =>
      ctx.db.insert("userPreferences", {
        userId,
        diet: "vegan",
        avoids: ["gluten"],
        seeks: [],
        updatedAt: Date.now(),
      }),
    );

    const asHousemate = await t
      .withIdentity(asUser(housemateId))
      .query(api.router.preferences.getPlanningSeed.authed, { householdId });

    // Franck's answer reaches Ana as an unattributed inheritance, never as her own row.
    expect(asHousemate.mine).toEqual({ diet: "omnivore", avoids: [], seeks: [] });
    expect(asHousemate.others).toEqual({ diet: "vegan", avoids: ["gluten"] });
  });
});
