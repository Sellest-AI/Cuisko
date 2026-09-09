import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { PreferenceValues } from "@shared/preferences";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const seedUser = (t: ReturnType<typeof convexTest>, name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    return userId;
  });

const rowsOf = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.query("userPreferences").collect());

/** A fresh object per call, so no test can mutate the answer another one sends. */
const vegan = (): PreferenceValues => ({
  diet: "vegan",
  avoids: ["gluten"],
  seeks: ["high-protein"],
});

describe("router/preferences/save", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation(api.router.preferences.save.authed, vegan())).rejects.toThrow();
  });

  test("inserts a row for a caller who has never answered", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");

    await t.withIdentity(asUser(userId)).mutation(api.router.preferences.save.authed, vegan());

    const rows = await rowsOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId, diet: "vegan", avoids: ["gluten"] });
  });

  /** Last answer wins, in place — a second answer must not become a second row. */
  test("overwrites the existing row rather than adding one", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const asFranck = t.withIdentity(asUser(userId));

    await asFranck.mutation(api.router.preferences.save.authed, vegan());
    await asFranck.mutation(api.router.preferences.save.authed, {
      diet: "omnivore",
      avoids: [],
      seeks: [],
    });

    const rows = await rowsOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ diet: "omnivore", avoids: [], seeks: [] });
  });

  /**
   * The load-bearing guarantee behind a screen that displays a whole household's constraints:
   * whatever it was showing, the only row this can reach is the caller's.
   */
  test("writes only the caller's row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");
    const housemateId = await seedUser(t, "Ana");
    await t.run((ctx) =>
      ctx.db.insert("userPreferences", {
        userId: housemateId,
        diet: "vegan",
        avoids: ["nuts"],
        seeks: [],
        updatedAt: 1,
      }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.preferences.save.authed, {
      diet: "omnivore",
      avoids: [],
      seeks: [],
    });

    const rows = await rowsOf(t);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.userId === housemateId)).toMatchObject({
      diet: "vegan",
      avoids: ["nuts"],
      updatedAt: 1,
    });
  });

  /**
   * Stored in each vocabulary's own order, deduplicated — so two identical answers compare equal
   * as arrays and a chip row cannot reshuffle itself between renders.
   */
  test("normalizes both lists to their vocabulary order", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");

    await t.withIdentity(asUser(userId)).mutation(api.router.preferences.save.authed, {
      diet: "pescatarian",
      avoids: ["milk", "gluten", "milk"],
      seeks: ["low-carb", "high-protein"],
    });

    const rows = await rowsOf(t);
    // ALLERGENS order: gluten precedes milk. NUTRITION_PREFERENCES order: high-protein precedes low-carb.
    expect(rows[0]).toMatchObject({
      avoids: ["gluten", "milk"],
      seeks: ["high-protein", "low-carb"],
    });
  });

  /**
   * The pair is unsatisfiable, not dangerous, and the screen is what prevents it — a validator
   * refusing it here would turn a stale client into a write that fails rather than a screen that
   * corrects itself. Pinned so that moving the rule into the validator is a deliberate act.
   */
  test("accepts the mutually exclusive pair rather than failing the write", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Franck");

    await t.withIdentity(asUser(userId)).mutation(api.router.preferences.save.authed, {
      diet: "omnivore",
      avoids: [],
      seeks: ["low-calorie", "high-calorie"],
    });

    const rows = await rowsOf(t);
    expect(rows[0]?.seeks).toEqual(["low-calorie", "high-calorie"]);
  });
});
