import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { PreferenceValues } from "@shared/preferences";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { getPlanningSeed } from "../getPlanningSeed";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
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

/** A member of `householdId`, with `values` saved if they have answered. */
const seedMember = (householdId: Id<"households">, name: string, values?: PreferenceValues) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("householdUsers", { householdId, userId });

    if (values) await ctx.db.insert("userPreferences", { userId, ...values, updatedAt: Date.now() });

    return userId;
  });

const seedOf = (householdId: Id<"households">, userId: Id<"users">) =>
  t.run((ctx) => getPlanningSeed(ctx, householdId, userId));

describe("functions/preferences/getPlanningSeed", () => {
  test("returns the caller's own row as `mine`", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck", {
      diet: "pescatarian",
      avoids: ["gluten"],
      seeks: ["high-protein"],
    });

    const seed = await seedOf(householdId, userId);

    expect(seed.mine).toEqual({ diet: "pescatarian", avoids: ["gluten"], seeks: ["high-protein"] });
  });

  /** A missing row means unsaid, not unconstrained — and it reads as the identity of both aggregations. */
  test("reads a caller with no row as omnivore and nothing avoided", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck");

    const seed = await seedOf(householdId, userId);

    expect(seed.mine).toEqual({ diet: "omnivore", avoids: [], seeks: [] });
  });

  test("unions `avoids` across the other members", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck", { diet: "omnivore", avoids: [], seeks: [] });
    await seedMember(householdId, "Ana", { diet: "omnivore", avoids: ["milk", "gluten"], seeks: [] });
    await seedMember(householdId, "Bob", { diet: "omnivore", avoids: ["gluten", "nuts"], seeks: [] });

    const seed = await seedOf(householdId, userId);

    // Deduplicated and in ALLERGENS' own order, so two identical households compare equal.
    expect(seed.others.avoids).toEqual(["gluten", "milk", "nuts"]);
  });

  test("takes the strictest diet among the other members", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck", { diet: "omnivore", avoids: [], seeks: [] });
    await seedMember(householdId, "Ana", { diet: "vegan", avoids: [], seeks: [] });
    await seedMember(householdId, "Bob", { diet: "pescatarian", avoids: [], seeks: [] });

    const seed = await seedOf(householdId, userId);

    expect(seed.others.diet).toBe("vegan");
  });

  test("contributes nothing for a member who has never answered", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck");
    await seedMember(householdId, "Ana");

    const seed = await seedOf(householdId, userId);

    expect(seed.others).toEqual({ diet: "omnivore", avoids: [] });
  });

  /**
   * The exclusion rows three and five of the toggle table turn on: a constraint the caller holds
   * alone must never come back marked inherited, or unticking it would leave their own row intact.
   */
  test("excludes the caller from `others`", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck", {
      diet: "vegan",
      avoids: ["gluten"],
      seeks: [],
    });

    const seed = await seedOf(householdId, userId);

    expect(seed.others).toEqual({ diet: "omnivore", avoids: [] });
  });

  /** `seeks` is not aggregated at all: two people's wishes do not add up, so only the caller's exist. */
  test("never aggregates `seeks`", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck", { diet: "omnivore", avoids: [], seeks: [] });
    await seedMember(householdId, "Ana", { diet: "omnivore", avoids: [], seeks: ["high-calorie"] });

    const seed = await seedOf(householdId, userId);

    expect(seed.mine.seeks).toEqual([]);
    expect(seed.others).not.toHaveProperty("seeks");
  });

  /** A member of ANOTHER household is not at this table, whatever they avoid. */
  test("ignores members of other households", async () => {
    const householdId = await seedHousehold();
    const otherHouseholdId = await t.run((ctx) =>
      ctx.db.insert("households", { name: "Elsewhere", inviteCode: "ZZZ999", updatedAt: Date.now() }),
    );
    const userId = await seedMember(householdId, "Franck");
    await seedMember(otherHouseholdId, "Stranger", { diet: "vegan", avoids: ["fish"], seeks: [] });

    const seed = await seedOf(householdId, userId);

    expect(seed.others).toEqual({ diet: "omnivore", avoids: [] });
  });

  /**
   * `undefined` is the answer for a household nobody has described, and it has to survive the trip:
   * the tunnel tells "never asked" from "answered nothing" by exactly this.
   */
  test("passes the household's defaults through, undefined included", async () => {
    const householdId = await seedHousehold();
    const userId = await seedMember(householdId, "Franck");

    const unanswered = await seedOf(householdId, userId);
    expect(unanswered.household).toEqual({
      equipments: ["oven"],
      defaultPeople: undefined,
      defaultSlots: undefined,
      defaultDays: undefined,
    });

    await t.run((ctx) =>
      ctx.db.patch(householdId, { defaultPeople: 4, defaultSlots: ["dinner"], defaultDays: 3 }),
    );

    const answered = await seedOf(householdId, userId);
    expect(answered.household).toEqual({
      equipments: ["oven"],
      defaultPeople: 4,
      defaultSlots: ["dinner"],
      defaultDays: 3,
    });
  });
});
