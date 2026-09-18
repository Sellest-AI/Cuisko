import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";
import type { Equipment } from "@shared/equipments";
import type { NutritionPreference } from "@shared/preferences";
import type { Timings } from "@shared/recipes";
import type { Tag } from "@shared/tags";

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
  /** The alternatives the recipe can be made with; empty is "pans and a knife". */
  equipments?: Equipment[];
  /** Left empty by default: a recipe `computeTags` could not weigh, which is the case the seeks rule is about. */
  tags?: Tag[];
};

/** A recipe of one line. Keys are 32-bit integers, as `randomShuffleKey` draws them. */
const recipe = ({
  shuffleKey,
  userId,
  isVegan = true,
  allergens: classified = [],
  timings = {},
  equipments = [],
  tags = [],
}: RecipeFacts) =>
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
      equipments,
      difficulty: 1,
      tags,
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
    equipments,
    seeks = [],
  }: {
    seed?: number;
    plates?: number;
    diet?: Diet;
    avoids?: Allergen[];
    maxMinutes?: number;
    equipments?: Equipment[];
    seeks?: NutritionPreference[];
  } = {},
) =>
  t.run(async (ctx) => {
    const pool = await candidatePool(ctx, {
      userId,
      seed,
      servings: 2,
      plates,
      diet,
      avoids,
      maxMinutes,
      equipments,
      seeks,
    });
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

  /**
   * The ingredient that rejects a recipe is the one every next rejected recipe asks for again, and
   * each `db.get` is one of the 4,096 index ranges a query may read. Cached on the read, not on the
   * recipe surviving — so three rejected recipes sharing the flour cost one read of it, not three.
   */
  test("reads a shared ingredient once, even when every recipe carrying it is rejected", async () => {
    const me = await user();
    const flour = await t.run((ctx) =>
      ctx.db.insert("ingredients", {
        name: { values: { fr: "farine" }, meta: {} },
        category: "VEGETABLE",
        emoji: "🌾",
        allergens: ["gluten"],
        defaultUnit: "g",
        defaultQuantity: 500,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      }),
    );
    for (const shuffleKey of [1, 2, 3]) {
      const recipeId = await recipe({ shuffleKey });
      await t.run((ctx) =>
        ctx.db.insert("recipeIngredients", {
          recipeId,
          ingredientId: flour,
          position: 1,
          quantity: 100,
          unit: "g",
          updatedAt: Date.now(),
        }),
      );
    }

    const reads = await t.run(async (ctx) => {
      const gets = new Map<string, number>();
      const db = Object.create(ctx.db) as typeof ctx.db;
      db.get = ((id: Id<"ingredients">) => {
        gets.set(id, (gets.get(id) ?? 0) + 1);
        return ctx.db.get(id);
      }) as typeof ctx.db.get;
      const pool = await candidatePool(
        { db },
        { userId: me, seed: 0, servings: 2, plates: 2, diet: "omnivore", avoids: ["gluten"], seeks: [] },
      );
      return { candidates: pool.candidates.length, flourReads: gets.get(flour) ?? 0 };
    });

    expect(reads).toEqual({ candidates: 0, flourReads: 1 });
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

  test("drops a recipe needing an appliance the kitchen lacks", async () => {
    const me = await user();
    await recipe({ shuffleKey: 1, equipments: ["oven"] });
    const stovetop = await recipe({ shuffleKey: 2, equipments: ["pressure cooker"] });

    expect(idsOf(await poolFor(me, { equipments: ["pressure cooker"] }))).toEqual([stovetop]);
  });

  /** The list is alternatives — "in the slow cooker, or covered in the oven" — so one in common is enough. */
  test("keeps a recipe one of whose alternatives the kitchen owns", async () => {
    const me = await user();
    const either = await recipe({ shuffleKey: 1, equipments: ["slow cooker", "oven"] });

    expect(idsOf(await poolFor(me, { equipments: ["oven"] }))).toEqual([either]);
  });

  /**
   * Not the untimed rule: an empty list is the sanitizer's answer, "pans and a knife", so it passes
   * even a kitchen that ticked nothing at all.
   */
  test("keeps a recipe needing nothing, whatever the kitchen", async () => {
    const me = await user();
    const pans = await recipe({ shuffleKey: 1 });
    await recipe({ shuffleKey: 2, equipments: ["microwave"] });

    expect(idsOf(await poolFor(me, { equipments: [] }))).toEqual([pans]);
  });

  /** A kitchen nobody asked about filters nothing — `weekIdeas` for a household never asked. */
  test("admits every recipe when no kitchen is given", async () => {
    const me = await user();
    const oven = await recipe({ shuffleKey: 1, equipments: ["oven"] });
    const pans = await recipe({ shuffleKey: 2 });

    expect(idsOf(await poolFor(me))).toEqual([oven, pans]);
  });

  test("drops a recipe lacking a sought tag", async () => {
    const me = await user();
    const lean = await recipe({ shuffleKey: 1, tags: ["high-protein"] });
    await recipe({ shuffleKey: 2, tags: ["low-carb"] });

    expect(idsOf(await poolFor(me, { seeks: ["high-protein"] }))).toEqual([lean]);
  });

  /** AND, not OR: a recipe fitting one of two wishes was not what was asked for. */
  test("keeps only a recipe carrying every sought tag", async () => {
    const me = await user();
    const both = await recipe({ shuffleKey: 1, tags: ["high-protein", "low-carb"] });
    await recipe({ shuffleKey: 2, tags: ["high-protein"] });

    expect(idsOf(await poolFor(me, { seeks: ["high-protein", "low-carb"] }))).toEqual([both]);
  });

  /**
   * The inverse of the untimed rule three tests up: an untagged recipe is one `computeTags` could
   * not weigh or found wanting, and neither is high-protein. See `matchesSeeks`.
   */
  test("drops an untagged recipe once anything is sought", async () => {
    const me = await user();
    await recipe({ shuffleKey: 1 });

    expect(idsOf(await poolFor(me, { seeks: ["high-protein"] }))).toEqual([]);
  });

  test("seeking nothing keeps the pool as it was, untagged recipes included", async () => {
    const me = await user();
    const bare = await recipe({ shuffleKey: 1 });
    const tagged = await recipe({ shuffleKey: 2, tags: ["low-calorie"] });

    expect(idsOf(await poolFor(me, { seeks: [] }))).toEqual([bare, tagged]);
  });
});
