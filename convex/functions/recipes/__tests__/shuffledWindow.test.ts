import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { modules } from "@convex/lib/__tests__/modules.fixtures";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { shuffledWindow } from "../shuffledWindow";
import { insertTestRecipe, type TestRecipe } from "./recipes.fixtures";

let t: ReturnType<typeof convexTest>;

const SPAN = 2 ** 32;

const seedRecipe = (title: string, shuffleKey: number, overrides: Partial<TestRecipe> = {}) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, { title: { values: { en: title }, meta: {} }, shuffleKey, ...overrides }),
  );

const catalog = { index: "by_user_and_is_archived_and_shuffle_key", userId: undefined } as const;

const titlesOf = (seed: number, size: number, range: Parameters<typeof shuffledWindow>[1]["range"] = catalog) =>
  t.run(async (ctx) =>
    (await shuffledWindow(ctx, { range, seed, size })).map((recipe) => recipe.title.values.en),
  );

beforeEach(async () => {
  t = convexTest(schema, modules);
});

describe("shuffledWindow", () => {
  test("starts at the first key past the seed", async () => {
    await seedRecipe("Low", 0.1 * SPAN);
    await seedRecipe("Mid", 0.4 * SPAN);
    await seedRecipe("High", 0.8 * SPAN);

    expect(await titlesOf(0.5, 1)).toEqual(["High"]);
  });

  test("wraps to the start when the keys past the seed come up short", async () => {
    await seedRecipe("Low", 0.1 * SPAN);
    await seedRecipe("Mid", 0.4 * SPAN);
    await seedRecipe("High", 0.8 * SPAN);

    expect(await titlesOf(0.5, 3)).toEqual(["High", "Low", "Mid"]);
  });

  test("never returns another owner's row", async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Cook" }));
    await seedRecipe("Catalog", 0.2 * SPAN);
    await seedRecipe("Mine", 0.6 * SPAN, { userId });

    expect(await titlesOf(0.5, 5)).toEqual(["Catalog"]);
  });

  test("a cuisine range returns only that cuisine", async () => {
    await seedRecipe("Cassoulet", 0.2 * SPAN, { cuisine: "french" });
    await seedRecipe("Lasagne", 0.6 * SPAN, { cuisine: "italian" });

    const french = {
      index: "by_user_and_is_archived_and_cuisine_and_shuffle_key",
      userId: undefined,
      cuisine: "french",
    } as const;

    expect(await titlesOf(0.5, 5, french)).toEqual(["Cassoulet"]);
  });

  test("an owner's range reads that owner's rows", async () => {
    const userId: Id<"users"> = await t.run((ctx) => ctx.db.insert("users", { name: "Cook" }));
    await seedRecipe("Catalog", 0.2 * SPAN);
    await seedRecipe("Mine", 0.6 * SPAN, { userId });

    expect(await titlesOf(0.5, 5, { index: "by_user_and_is_archived_and_shuffle_key", userId })).toEqual(["Mine"]);
  });
});
