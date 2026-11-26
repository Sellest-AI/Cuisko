import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe, type TestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import { modules } from "@convex/lib/__tests__/modules.fixtures";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. Stops at the `.` so a `"use node"` sibling
 * stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/getCatalog."))
      .map(([, load]) => load()),
  ),
);

let t: ReturnType<typeof convexTest>;

const DAY = "2026-11-26";

const seedUser = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Cook" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

/** One recipe, with a shuffle key spread over the 32-bit span so any seed lands somewhere among them. */
let _key = 0;
const seedRecipe = (title: string, overrides: Partial<TestRecipe> = {}): Promise<Id<"recipes">> =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { en: title, fr: title }, meta: {} },
      shuffleKey: (_key++ * 97_003_201) % 2 ** 32,
      ...overrides,
    }),
  );

const shelf = (args: { dayKey?: string; cuisine?: "french" | "italian" } = {}) =>
  t.query(api.router.recipes.getCatalog.anon, { dayKey: DAY, locale: "en", ...args });

beforeEach(() => {
  t = convexTest(schema, modules);
  _key = 0;
});

describe("router/recipes/getCatalog", () => {
  test("answers a caller with no account", async () => {
    await seedRecipe("Ratatouille");

    expect((await shelf()).map((card) => card.title)).toEqual(["Ratatouille"]);
  });

  test("never returns a cook's own recipe, only the catalog's", async () => {
    const userId = await seedUser();
    await seedRecipe("Catalog");
    await seedRecipe("Mine", { userId });

    expect((await shelf()).map((card) => card.title)).toEqual(["Catalog"]);
    expect((await shelf({ cuisine: "french" })).map((card) => card.title)).toEqual(["Catalog"]);
  });

  test("never returns an archived recipe", async () => {
    await seedRecipe("Live");
    await seedRecipe("Archived", { isArchived: true });

    expect((await shelf()).map((card) => card.title)).toEqual(["Live"]);
  });

  test("a cuisine returns only that cuisine", async () => {
    await seedRecipe("Cassoulet", { cuisine: "french" });
    await seedRecipe("Lasagne", { cuisine: "italian" });

    expect((await shelf({ cuisine: "italian" })).map((card) => card.title)).toEqual(["Lasagne"]);
  });

  test("the same day gives the same order", async () => {
    for (let index = 0; index < 10; index++) await seedRecipe(`Recipe ${index}`);

    expect(await shelf()).toEqual(await shelf());
  });

  test("another day can open the shuffle elsewhere", async () => {
    for (let index = 0; index < 10; index++) await seedRecipe(`Recipe ${index}`);
    const days = ["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];

    const firsts = new Set(await Promise.all(days.map(async (dayKey) => (await shelf({ dayKey }))[0]?.title)));

    expect(firsts.size).toBeGreaterThan(1);
  });

  test("shows at most 24 featured recipes, and at most 60 of one cuisine", async () => {
    for (let index = 0; index < 30; index++) await seedRecipe(`Italian ${index}`, { cuisine: "italian" });
    for (let index = 0; index < 35; index++) await seedRecipe(`French ${index}`, { cuisine: "french" });
    for (let index = 0; index < 30; index++) await seedRecipe(`More ${index}`, { cuisine: "french" });

    expect(await shelf()).toHaveLength(24);
    expect(await shelf({ cuisine: "french" })).toHaveLength(60);
  });

  test("a dessert and a side are returned like any other recipe", async () => {
    await seedRecipe("Tarte Tatin", { tags: ["dessert"] });
    await seedRecipe("Gratin", { tags: ["side"] });

    expect((await shelf()).map((card) => card.title).sort()).toEqual(["Gratin", "Tarte Tatin"]);
  });
});
