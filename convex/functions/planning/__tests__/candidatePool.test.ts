import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";
import type { Timings } from "@shared/recipes";

import schema from "../../../schema";
import { CANDIDATES_PER_PLATE, candidatePool } from "../candidatePool";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const user = () => t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

type RecipeFacts = {
  shuffleKey: number;
  userId?: Id<"users">;
  isVegan?: boolean;
  /** `null` is an ingredient nobody has classified yet — stored as the field left unset. */
  allergens?: Allergen[] | null;
  /** Left empty by default: most of the catalog is untimed, and that is the case worth defaulting to. */
  timings?: Timings;
};

/** A recipe of one line. Keys are 32-bit integers, as `randomShuffleKey` draws them. */
const recipe = ({ shuffleKey, userId, isVegan = true, allergens: classified = [], timings = {} }: RecipeFacts) =>
  t.run(async (ctx) => {
    const allergens = classified ?? undefined;
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: "x" }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      allergens,
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await ctx.db.insert("recipes", {
      title: { values: { fr: "x" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings,
      search: { en: "", fr: "" },
      userId,
      shuffleKey,
      isVegan,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 200,
      unit: "g",
      updatedAt: Date.now(),
    });
    return recipeId;
  });

// `t.run` returns through Convex serialization, which has no Map — so only the candidates cross.
const poolFor = (
  userId: Id<"users">,
  {
    seed = 0,
    plates = 2,
    diet = "omnivore",
    avoids = [],
    maxMinutes,
  }: { seed?: number; plates?: number; diet?: Diet; avoids?: Allergen[]; maxMinutes?: number } = {},
) =>
  t.run(async (ctx) => {
    const pool = await candidatePool(ctx, { userId, seed, servings: 2, plates, diet, avoids, maxMinutes });
    return pool.candidates.map(({ recipeId, isMine }) => ({ recipeId, isMine }));
  });

const idsOf = (candidates: { recipeId: Id<"recipes"> }[]) => candidates.map(({ recipeId }) => recipeId);

describe("functions/planning/candidatePool", () => {
  /**
   * The seed is a fraction and the keys span 32 bits. Compared raw, every key sits past the seed,
   * so the window always opened at the lowest key and the same week came back on every run.
   */
  test("opens the window where the seed falls on the key's span, and wraps past the end", async () => {
    const me = await user();
    const low = await recipe({ shuffleKey: 1_000_000_000 });
    const high = await recipe({ shuffleKey: 3_000_000_000 });

    expect(idsOf(await poolFor(me, { seed: 0.5 }))).toEqual([high, low]);
    expect(idsOf(await poolFor(me, { seed: 0.1 }))).toEqual([low, high]);
  });

  test("drops a recipe the run's diet excludes", async () => {
    const me = await user();
    const salad = await recipe({ shuffleKey: 1 });
    await recipe({ shuffleKey: 2, isVegan: false });

    expect(idsOf(await poolFor(me, { diet: "vegan" }))).toEqual([salad]);
  });

  test("drops a recipe carrying an allergen the run avoids", async () => {
    const me = await user();
    const salad = await recipe({ shuffleKey: 1 });
    await recipe({ shuffleKey: 2, allergens: ["gluten"] });

    expect(idsOf(await poolFor(me, { avoids: ["gluten"] }))).toEqual([salad]);
  });

  /** Unknown means excluded — but only when there is something to avoid. */
  test("drops an unclassified ingredient only when the run avoids something", async () => {
    const me = await user();
    const unclassified = await recipe({ shuffleKey: 1, allergens: null });

    expect(idsOf(await poolFor(me, { avoids: ["milk"] }))).toEqual([]);
    expect(idsOf(await poolFor(me))).toEqual([unclassified]);
  });

  test("fills from the caller's own recipes when the catalog is short, and marks them", async () => {
    const me = await user();
    const catalog = await recipe({ shuffleKey: 1 });
    const mine = await recipe({ shuffleKey: 2, userId: me });

    expect(await poolFor(me)).toEqual([
      { recipeId: catalog, isMine: false },
      { recipeId: mine, isMine: true },
    ]);
  });

  /** `userId` is the index's first field so that a shuffle can never reach another user's recipes. */
  test("never draws another user's private recipes", async () => {
    const me = await user();
    const stranger = await user();
    await recipe({ shuffleKey: 1, userId: stranger });

    expect(await poolFor(me)).toEqual([]);
  });

  test("loads lines only until each plate has its candidates", async () => {
    const me = await user();
    for (let key = 1; key <= CANDIDATES_PER_PLATE + 2; key++) await recipe({ shuffleKey: key });

    expect(await poolFor(me, { plates: 1 })).toHaveLength(CANDIDATES_PER_PLATE);
  });
  test("drops a recipe declaring more minutes than the ceiling allows", async () => {
    const me = await user();
    const quick = await recipe({ shuffleKey: 1, timings: { preparation: 10, cooking: 10 } });
    await recipe({ shuffleKey: 2, timings: { preparation: 10, cooking: 50 } });

    expect(idsOf(await poolFor(me, { maxMinutes: 24 }))).toEqual([quick]);
  });

  /** The ceiling is inclusive: a recipe landing exactly on it was asked for, not excluded by it. */
  test("keeps a recipe sitting exactly on the ceiling", async () => {
    const me = await user();
    const exact = await recipe({ shuffleKey: 1, timings: { preparation: 24 } });

    expect(idsOf(await poolFor(me, { maxMinutes: 24 }))).toEqual([exact]);
  });

  /** Resting counts, which is the whole reason a proved dough cannot be a Tuesday dinner. */
  test("counts resting time against the ceiling", async () => {
    const me = await user();
    await recipe({ shuffleKey: 1, timings: { preparation: 5, cooking: 5, resting: 720 } });

    expect(idsOf(await poolFor(me, { maxMinutes: 72 }))).toEqual([]);
  });

  /**
   * Deliberately the opposite of the allergen rule: unknown passes a ceiling, because a mistimed
   * dinner annoys a cook and an undeclared allergen harms one.
   */
  test("admits an untimed recipe under every ceiling", async () => {
    const me = await user();
    const untimed = await recipe({ shuffleKey: 1 });

    expect(idsOf(await poolFor(me, { maxMinutes: 24 }))).toEqual([untimed]);
  });

  /** The `any` path: no ceiling asked for is no ceiling applied, not an infinite one. */
  test("admits every recipe when no ceiling is given", async () => {
    const me = await user();
    const slow = await recipe({ shuffleKey: 1, timings: { cooking: 240 } });
    const quick = await recipe({ shuffleKey: 2, timings: { cooking: 10 } });

    expect(idsOf(await poolFor(me))).toEqual([slow, quick]);
  });
});
