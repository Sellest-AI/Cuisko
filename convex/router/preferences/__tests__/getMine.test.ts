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
      .filter(([path]) => path.startsWith("/convex/router/preferences/getMine."))
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

const seedPreferences = (
  t: ReturnType<typeof convexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
  diet: "vegan" | "vegetarian" | "pescatarian" | "omnivore",
) =>
  t.run((ctx) =>
    ctx.db.insert("userPreferences", {
      userId,
      diet,
      avoids: ["gluten"],
      seeks: ["high-protein"],
      updatedAt: Date.now(),
    }),
  );

describe("router/preferences/getMine", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.router.preferences.getMine.authed, {})).rejects.toThrow();
  });

  test("returns the caller's own row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    await seedPreferences(t, userId, "vegetarian");

    const preferences = await t
      .withIdentity(asUser(userId))
      .query(api.router.preferences.getMine.authed, {});

    expect(preferences?.diet).toBe("vegetarian");
    expect(preferences?.avoids).toEqual(["gluten"]);
  });

  /**
   * `null`, not a default row. The distinction between "eats anything" and "nobody has asked" is
   * the whole reason a missing row is legal, and it has to survive the trip to the client — the
   * tunnel shows an unanswered question differently from an answered one.
   */
  test("returns null for a caller who has never answered", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Newcomer");

    expect(
      await t.withIdentity(asUser(userId)).query(api.router.preferences.getMine.authed, {}),
    ).toBeNull();
  });

  /**
   * `by_user` is not a unique index — Convex has none — so one row per user is an invariant `save`
   * upholds rather than one the database does. Failing loudly is the deliberate choice: answering
   * with whichever row the index reached first would show the user one of their two answers,
   * chosen arbitrarily and differing between reads, with nothing reporting a problem.
   */
  test("refuses to answer when a user somehow has two rows", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    await seedPreferences(t, userId, "vegan");
    await seedPreferences(t, userId, "omnivore");

    await expect(
      t.withIdentity(asUser(userId)).query(api.router.preferences.getMine.authed, {}),
    ).rejects.toThrow();
  });

  test("never returns another user's row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const housemateId = await seedUser(t, "Ana");
    await seedPreferences(t, housemateId, "vegan");

    expect(
      await t.withIdentity(asUser(userId)).query(api.router.preferences.getMine.authed, {}),
    ).toBeNull();
  });
});
