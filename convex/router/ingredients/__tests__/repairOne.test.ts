import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { drainScheduled } from "@convex/__tests__/scheduler.fixtures";
import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { RepairIngredientOutput } from "@convex/agent/tools/repairIngredient";
import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import { loadRecipe } from "@convex/functions/recipes/loadRecipe";
import { modules } from "@convex/lib/__tests__/modules.fixtures";
import { warmActions } from "@convex/lib/__tests__/warmUp.fixtures";
import type { RepairableField } from "@convex/schema/ingredientPayloads";

import schema from "../../../schema";

/**
 * The model replaced: what is tested is everything around it — which fields are asked, what is
 * written, and what Error tracking is sent.
 */
const toolRun = vi.hoisted(() => vi.fn<(ctx: unknown, input: { missing: RepairableField[] }) => Promise<RepairIngredientOutput>>());
const captureException = vi.hoisted(() => vi.fn());

vi.mock("@convex/agent/tools/repairIngredient", async (original) => ({
  ...(await original<object>()),
  repairIngredient: { run: toolRun },
}));
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture: vi.fn(), captureException } }));

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  warmActions(
    modules,
    "/convex/router/ingredients/repairOne.",
    "/convex/router/ingredients/getIngredient.",
    "/convex/router/ingredients/updateOne.",
    "/convex/router/recipes/refreshUsing.",
  ),
);

let t: ReturnType<typeof convexTest>;

/** Ham with every score nutrient but sodium, and no slice weight. */
const seedHam = (over: Partial<Doc<"ingredients">> = {}) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "Jambon", en: "Ham" }, meta: {} },
      search: { fr: "jambon", en: "ham" },
      category: "MEAT",
      emoji: "🍖",
      diet: "omnivore",
      allergens: [],
      defaultUnit: "g",
      defaultQuantity: 200,
      nutrition: { calories: 115, protein: 20, fat: 3.5, saturatedFat: 1.2, carbohydrates: 1, sugars: 0.8, fiber: 0 },
      updatedAt: 1,
      ...over,
    }),
  );

const seedCook = () => t.run((ctx) => ctx.db.insert("users", { name: "Camille" }));

const trace = (distinctId: string | null) => ({ traceId: "trace-1", operation: "recipes/createOne" as const, distinctId });

const repair = (ingredientId: Id<"ingredients">, missing: RepairableField[], distinctId: string | null = null) =>
  t.action(internal.router.ingredients.repairOne._internal, { ingredientId, missing, __trace: trace(distinctId) });

const rowOf = (ingredientId: Id<"ingredients">) => t.run(async (ctx) => (await ctx.db.get(ingredientId))!);

beforeEach(() => {
  t = convexTest(schema, modules);
  toolRun.mockReset();
  captureException.mockReset();
});

afterEach(() => drainScheduled(t));

describe("router/ingredients/repairOne", () => {
  test("nothing still missing makes no call and stamps nothing", async () => {
    const ham = await seedHam({ gramsPerSlice: 40 });

    await repair(ham, ["gramsPerSlice"]);

    expect(toolRun).not.toHaveBeenCalled();
    expect((await rowOf(ham)).repairedAt).toBeUndefined();
  });

  test("a sodium answer completes the score, and the row's other figures stay", async () => {
    const ham = await seedHam();
    toolRun.mockResolvedValue({ fields: { sodium: 820 }, refused: [] });

    await repair(ham, ["sodium"]);

    const { nutrition, nutriScore, repairedAt } = await rowOf(ham);
    expect(nutrition.sodium).toBe(820);
    expect(nutrition.calories).toBe(115);
    expect(nutriScore).toBeDefined();
    expect(repairedAt).toEqual(expect.any(Number));
  });

  /** Sugars are counted inside carbohydrates: the row's 1 g is the most the ham can hold. */
  test("sugars above the row's carbohydrates are lowered to them, the other fields kept", async () => {
    const { sugars: _sugars, ...nutrition } = (await rowOf(await seedHam())).nutrition;
    const ham = await seedHam({ nutrition });
    toolRun.mockResolvedValue({ fields: { sugars: 5, sodium: 800 }, refused: [] });

    await repair(ham, ["sugars", "sodium"]);

    const row = await rowOf(ham);
    expect(row.nutrition.sugars).toBe(1);
    expect(row.nutrition.sodium).toBe(800);
  });

  /** Silent, it would be re-asked and paid for on every save, and nobody would know why no score came. */
  test("a nutrient the row contradicts is reported, with the answer and its bound", async () => {
    const { sugars: _sugars, ...nutrition } = (await rowOf(await seedHam())).nutrition;
    const ham = await seedHam({ nutrition });
    toolRun.mockResolvedValue({ fields: { sugars: 5, sodium: 800 }, refused: [] });

    await repair(ham, ["sugars", "sodium"]);

    expect(captureException.mock.calls.map(([, args]) => args)).toEqual([
      expect.objectContaining({
        distinctId: ham,
        additionalProperties: { ingredientId: ham, contradicted: "sugars 5 > carbohydrates 1", feature: "ingredient repair" },
      }),
    ]);
  });

  test("a refused weight is not written, and is reported once, under the trace's person", async () => {
    const chicken = await seedHam();
    const cook = await seedCook();
    toolRun.mockResolvedValue({ fields: {}, refused: ["gramsPerMl"] });

    await repair(chicken, ["gramsPerMl"], cook);

    expect((await rowOf(chicken)).gramsPerMl).toBeUndefined();
    expect(captureException.mock.calls.map(([, args]) => args)).toEqual([
      expect.objectContaining({
        distinctId: cook,
        additionalProperties: { ingredientId: chicken, refused: "gramsPerMl", feature: "ingredient repair" },
      }),
    ]);
  });

  test("a refusal under a trace with nobody is filed under the ingredient", async () => {
    const chicken = await seedHam();
    toolRun.mockResolvedValue({ fields: {}, refused: ["gramsPerMl"] });

    await repair(chicken, ["gramsPerMl"]);

    expect(captureException.mock.calls.map(([, args]) => args.distinctId)).toEqual([chicken]);
  });

  test("the recipe's title reaches the tool", async () => {
    const ham = await seedHam();
    toolRun.mockResolvedValue({ fields: { gramsPerSlice: 40 }, refused: [] });

    await t.action(internal.router.ingredients.repairOne._internal, {
      ingredientId: ham,
      missing: ["gramsPerSlice"],
      recipeTitle: "Croque-monsieur",
      __trace: trace(null),
    });

    expect(toolRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ recipeTitle: "Croque-monsieur" }));
  });

  test("nothing refused sends Error tracking nothing", async () => {
    const ham = await seedHam();
    toolRun.mockResolvedValue({ fields: { gramsPerSlice: 40 }, refused: [] });

    await repair(ham, ["gramsPerSlice"]);

    expect(captureException).not.toHaveBeenCalled();
  });

  test("end to end: the ham gets a slice weight, and the croque-monsieur a Cui-Score", async () => {
    const ham = await seedHam({ nutrition: {
      calories: 115, protein: 20, fat: 3.5, saturatedFat: 1.2, carbohydrates: 1, sugars: 0.8, fiber: 0, sodium: 800,
    } });
    const croque = await t.run(async (ctx) => {
      const recipeId = await insertTestRecipe(ctx.db, { servings: 2, tags: [] });
      await ctx.db.insert("recipeIngredients", {
        recipeId, ingredientId: ham, position: 0, quantity: 4, unit: "slice", updatedAt: 1,
      });
      return recipeId;
    });
    const cuiScore = () =>
      t.run(async (ctx) => (await loadRecipe(ctx, { recipe: croque, locale: "fr" })).nutrition?.cuiScore);
    expect(await cuiScore()).toBeNull();
    toolRun.mockResolvedValue({ fields: { gramsPerSlice: 40 }, refused: [] });

    await repair(ham, ["gramsPerSlice"]);
    await drainScheduled(t);

    expect(await cuiScore()).toEqual(expect.anything());
  });
});
