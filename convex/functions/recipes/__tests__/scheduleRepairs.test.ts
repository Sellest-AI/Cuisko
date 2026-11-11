import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { modules } from "@convex/lib/__tests__/modules.fixtures";
import type { TracedMutationCtx } from "@convex/procedures";
import type { RecipeUnit } from "@shared/ingredients";

import schema from "../../../schema";
import type { WeighableLine } from "../recipeNutrition";
import { MAX_REPAIRS, scheduleRepairs } from "../scheduleRepairs";

let t: ReturnType<typeof convexTest>;

/** Every nutrient the Nutri-Score reads, and iron: a row that lacks only weights. */
const SCORED = { calories: 115, protein: 20, fat: 3.5, saturatedFat: 1.2, carbohydrates: 1, sugars: 0.8, fiber: 0, sodium: 800, iron: 1 };

/**
 * A catalog row, built in memory: `scheduleRepairs` reads none, so none is inserted. The id is a
 * label, never looked up.
 */
const ham = (id: string, over: Partial<Doc<"ingredients">> = {}): Doc<"ingredients"> => ({
  _id: id as Id<"ingredients">,
  _creationTime: 0,
  name: { values: { fr: "Jambon", en: "Ham" }, meta: {} },
  search: { fr: "jambon", en: "ham" },
  category: "MEAT",
  emoji: "🍖",
  diet: "omnivore",
  allergens: [],
  defaultUnit: "g",
  defaultQuantity: 200,
  nutrition: SCORED,
  updatedAt: 1,
  ...over,
});

const line = (ingredient: Doc<"ingredients">, unit: RecipeUnit): WeighableLine => ({ ingredient, quantity: 1, unit });

const TRACE = { traceId: "trace-1", operation: "recipes/createOne" as const, distinctId: null };

/**
 * Runs it with the traced ctx a persist hands it, over a `db` that throws on any use: the save
 * already loaded these rows, and a read here would pay for them twice.
 */
const schedule = (lines: WeighableLine[]) =>
  t.run((ctx) => {
    const noDb = new Proxy({}, { get: () => { throw new Error("scheduleRepairs read the database"); } });
    const traced = {
      ...ctx,
      db: noDb,
      trace: TRACE,
      runTracedMutation: () => Promise.reject(new Error("unused")),
      scheduleTracedAfter: (delayMs: number, ref: never, args: object) =>
        ctx.scheduler.runAfter(delayMs, ref, { ...args, __trace: TRACE } as never),
    } as unknown as TracedMutationCtx;

    return scheduleRepairs(traced, lines);
  });

const jobs = () =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).map(({ name, args }) => ({ name, args: args[0] })),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/scheduleRepairs", () => {
  test("a recipe whose rows hold every field it needs schedules nothing", async () => {
    await schedule([line(ham("ham", { gramsPerSlice: 40 }), "slice"), line(ham("flour"), "g")]);

    expect(await jobs()).toEqual([]);
  });

  test("no lines, as a recipe missing a line hands it, schedules nothing", async () => {
    await schedule([]);

    expect(await jobs()).toEqual([]);
  });

  test("a row written in two units is one job, asking for both units' weights", async () => {
    const row = ham("ham");

    await schedule([line(row, "slice"), line(row, "pcs"), line(row, "g")]);

    expect((await jobs()).map(({ args }) => args)).toEqual([
      expect.objectContaining({ ingredientId: "ham", missing: ["gramsPerPiece", "gramsPerSlice"] }),
    ]);
  });

  test("the job runs repairOne under the save's trace, and names no recipe", async () => {
    await schedule([line(ham("ham"), "slice")]);

    expect(await jobs()).toEqual([
      {
        name: "router/ingredients/repairOne:_internal",
        args: { ingredientId: "ham", missing: ["gramsPerSlice"], __trace: TRACE },
      },
    ]);
  });

  test(`schedules at most ${MAX_REPAIRS} jobs; the other rows wait for the next save`, async () => {
    const rows = Array.from({ length: MAX_REPAIRS + 5 }, (_, index) => ham(`ham-${index}`));

    await schedule(rows.map((row) => line(row, "slice")));

    expect(await jobs()).toHaveLength(MAX_REPAIRS);
  });
});
