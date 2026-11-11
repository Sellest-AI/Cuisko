import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { drainScheduled } from "@convex/__tests__/scheduler.fixtures";
import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { modules } from "@convex/lib/__tests__/modules.fixtures";
import { warmActions } from "@convex/lib/__tests__/warmUp.fixtures";
import type { IngredientPatch } from "@convex/schema/ingredientPayloads";

import schema from "../../../schema";

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  warmActions(modules, "/convex/router/ingredients/updateOne.", "/convex/router/recipes/refreshUsing."),
);

let t: ReturnType<typeof convexTest>;

/** Ham with calories, protein, fat and carbohydrates, and none of the four score nutrients. */
const seedHam = (over: Partial<Doc<"ingredients">> = {}) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "Jambon", en: "Ham" }, meta: {} },
      search: { fr: "jambon", en: "ham" },
      category: "MEAT",
      emoji: "🍖",
      defaultUnit: "g",
      defaultQuantity: 200,
      nutrition: { calories: 115, protein: 20, fat: 3.5, carbohydrates: 1 },
      updatedAt: 1,
      ...over,
    }),
  );

const patch = (
  ingredientId: Id<"ingredients">,
  fields: IngredientPatch,
  options: { repaired?: boolean } = {},
) => t.mutation(internal.router.ingredients.updateOne._internal, { ingredientId, fields, ...options });

const rowOf = (ingredientId: Id<"ingredients">) => t.run((ctx) => ctx.db.get(ingredientId));

const scheduled = () => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

beforeEach(() => {
  t = convexTest(schema, modules);
});

afterEach(() => drainScheduled(t));

describe("patchIngredient", () => {
  test("a sodium patch keeps the row's calories and other nutrients", async () => {
    const ham = await seedHam();

    await patch(ham, { sodium: 0.8 });

    expect((await rowOf(ham))!.nutrition).toEqual({
      calories: 115, protein: 20, fat: 3.5, carbohydrates: 1, sodium: 0.8,
    });
  });

  test("a set field is never replaced", async () => {
    const ham = await seedHam({ gramsPerSlice: 30 });

    const { written } = await patch(ham, { gramsPerSlice: 45, sodium: 0.8 });

    expect(written).toEqual(["sodium"]);
    expect((await rowOf(ham))!.gramsPerSlice).toBe(30);
  });

  test("the Nutri-Score is derived once the four nutrients are complete", async () => {
    const ham = await seedHam();

    await patch(ham, { saturatedFat: 1.2, sugars: 0.8 });
    expect((await rowOf(ham))!.nutriScore).toBeUndefined();

    await patch(ham, { fiber: 0, sodium: 0.8 });
    expect((await rowOf(ham))!.nutriScore?.grade).toEqual(expect.any(String));
  });

  test("repairedAt is set when nothing was written", async () => {
    const ham = await seedHam({ gramsPerSlice: 30 });

    const { written } = await patch(ham, { gramsPerSlice: 45 }, { repaired: true });

    expect(written).toEqual([]);
    expect((await rowOf(ham))!.repairedAt).toEqual(expect.any(Number));
  });

  /** `updatedAt` says a fact changed; a repair that found nothing to write changed none. */
  test("a repair that wrote nothing leaves updatedAt as it was", async () => {
    const ham = await seedHam({ gramsPerSlice: 30 });

    await patch(ham, { gramsPerSlice: 45 }, { repaired: true });

    expect((await rowOf(ham))!.updatedAt).toBe(1);
  });

  test("a fact written schedules the refresh of the recipes using the row", async () => {
    const ham = await seedHam();

    await patch(ham, { gramsPerSlice: 30 });

    expect((await scheduled()).map(({ name, args }) => ({ name, args: args[0] }))).toEqual([
      { name: "router/recipes/refreshUsing:_internal", args: { ingredientId: ham, cursor: null } },
    ]);
  });

  test("nothing written schedules nothing", async () => {
    const ham = await seedHam({ gramsPerSlice: 30 });

    await patch(ham, { gramsPerSlice: 45 }, { repaired: true });

    expect(await scheduled()).toEqual([]);
  });

  test("a row gone writes nothing", async () => {
    const ham = await seedHam();
    await t.run((ctx) => ctx.db.delete(ham));

    expect(await patch(ham, { sodium: 0.8 })).toEqual({ written: [] });
  });
});
