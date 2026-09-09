import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Equipment } from "@shared/equipments";
import type { MealSlot } from "@shared/mealSlots";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

type Answer = {
  equipments: Equipment[];
  defaultPeople: number;
  defaultSlots: MealSlot[];
  defaultDays: number;
};

/** A fresh object per call, so no test can mutate the answer another one sends. */
const answer = (): Answer => ({
  equipments: ["oven", "grill"],
  defaultPeople: 4,
  defaultSlots: ["dinner"],
  defaultDays: 3,
});

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

/** A household nobody has described yet: every default absent, which is what `undefined` means here. */
const seedHousehold = (inviteCode = "ABC123") =>
  t.run((ctx) =>
    ctx.db.insert("households", { name: "Home", inviteCode, updatedAt: Date.now() }),
  );

const join = (householdId: Id<"households">, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.insert("householdUsers", { householdId, userId }));

const householdOf = (householdId: Id<"households">) => t.run((ctx) => ctx.db.get(householdId));

describe("router/households/saveDefaults", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold();

    await expect(
      t.mutation(api.router.households.saveDefaults.authed, { householdId, ...answer() }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const householdId = await seedHousehold();
    const outsiderId = await seedUser("Outsider");

    await expect(
      t
        .withIdentity(asUser(outsiderId))
        .mutation(api.router.households.saveDefaults.authed, { householdId, ...answer() }),
    ).rejects.toThrow();
  });

  test("ends the silence on a household nobody had described", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser("Franck");
    await join(householdId, userId);

    expect((await householdOf(householdId))?.equipments).toBeUndefined();

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.households.saveDefaults.authed, { householdId, ...answer() });

    expect(await householdOf(householdId)).toMatchObject({
      equipments: ["oven", "grill"],
      defaultPeople: 4,
      defaultSlots: ["dinner"],
      defaultDays: 3,
    });
  });

  /** Last answer wins, including down to nothing: unticking the last appliance is an answer. */
  test("overwrites an already-answered field, empty list included", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser("Franck");
    await join(householdId, userId);
    const asFranck = t.withIdentity(asUser(userId));

    await asFranck.mutation(api.router.households.saveDefaults.authed, { householdId, ...answer() });
    await asFranck.mutation(api.router.households.saveDefaults.authed, {
      householdId,
      equipments: [],
      defaultPeople: 2,
      defaultSlots: ["lunch", "dinner"],
      defaultDays: 7,
    });

    expect(await householdOf(householdId)).toMatchObject({
      equipments: [],
      defaultPeople: 2,
      defaultSlots: ["lunch", "dinner"],
      defaultDays: 7,
    });
  });

  /** Both lists land in their vocabulary's own order, so a prefilled chip row cannot reshuffle itself. */
  test("normalizes both lists to their vocabulary order", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser("Franck");
    await join(householdId, userId);

    await t.withIdentity(asUser(userId)).mutation(api.router.households.saveDefaults.authed, {
      householdId,
      equipments: ["grill", "oven", "grill"],
      defaultPeople: 4,
      defaultSlots: ["dinner", "lunch"],
      defaultDays: 3,
    });

    // EQUIPMENTS order: oven precedes grill. MEAL_SLOTS order: lunch precedes dinner.
    expect(await householdOf(householdId)).toMatchObject({
      equipments: ["oven", "grill"],
      defaultSlots: ["lunch", "dinner"],
    });
  });

  /** Nothing on this row records who answered: it is the kitchen's answer, not a member's. */
  test("writes only the named household", async () => {
    const householdId = await seedHousehold();
    const otherHouseholdId = await seedHousehold("ZZZ999");
    const userId = await seedUser("Franck");
    await join(householdId, userId);
    await join(otherHouseholdId, userId);

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.households.saveDefaults.authed, { householdId, ...answer() });

    expect((await householdOf(otherHouseholdId))?.equipments).toBeUndefined();
  });
});
