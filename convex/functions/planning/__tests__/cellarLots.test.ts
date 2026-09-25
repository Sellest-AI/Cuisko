import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";

import schema from "../../../schema";
import { cellarLots } from "../cellarLots";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const DAY = 86_400_000;

const household = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() }));

const ingredient = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "lait", en: "milk" }, meta: {} },
      category: "DAIRY",
      emoji: "🥛",
      defaultUnit: "l",
      defaultQuantity: 1,
      shelfLifeDays: 90,
      openedShelfLifeDays: 3,
      nutrition: { calories: 60, protein: 3, fat: 3, carbohydrates: 5 },
      updatedAt: Date.now(),
    }),
  );

const lot = (
  householdId: Id<"households">,
  ingredientId: Id<"ingredients">,
  quantity: number,
  expirationDate?: number,
) =>
  t.run((ctx) =>
    ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "l", quantity, expirationDate, updatedAt: Date.now() }),
  );

// Entries rather than the Map itself: `t.run` returns through Convex's value encoding, which has no Map.
const lotsOf = async (householdId: Id<"households">) =>
  new Map(await t.run(async (ctx) => [...(await cellarLots(ctx, householdId))]));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("cellarLots", () => {
  test("reserves the lot that goes off soonest, not the first one bought", async () => {
    const householdId = await household();
    const milk = await ingredient();
    await lot(householdId, milk, 2, 90 * DAY);
    const older = await lot(householdId, milk, 1, 30 * DAY);

    expect((await lotsOf(householdId)).get(milk)).toBe(older);
  });

  test("puts an undated lot after a dated one", async () => {
    const householdId = await household();
    const milk = await ingredient();
    await lot(householdId, milk, 2);
    const dated = await lot(householdId, milk, 1, 90 * DAY);

    expect((await lotsOf(householdId)).get(milk)).toBe(dated);
  });

  test("keeps the oldest row when the dates tie, or when neither has one", async () => {
    const householdId = await household();
    const milk = await ingredient();
    const first = await lot(householdId, milk, 2);
    await lot(householdId, milk, 1);

    expect((await lotsOf(householdId)).get(milk)).toBe(first);
  });

  test("never reserves a lot that has run out, however soon it went off", async () => {
    const householdId = await household();
    const milk = await ingredient();
    await lot(householdId, milk, 0, 1 * DAY);
    const held = await lot(householdId, milk, 1, 90 * DAY);

    expect((await lotsOf(householdId)).get(milk)).toBe(held);
  });

  test("reads only the household's own cellar", async () => {
    const householdId = await household();
    const neighbour = await household();
    const milk = await ingredient();
    await lot(neighbour, milk, 1, 1 * DAY);
    const own = await lot(householdId, milk, 1, 90 * DAY);

    expect(await lotsOf(householdId)).toEqual(new Map([[milk, own]]));
  });
});
