import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
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
  /** A recipe its cook deleted; live by default, as nearly every row is. */
  isArchived?: boolean;
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
  isArchived = false,
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
    const recipeId = await insertTestRecipe(ctx.db, {
      isArchived,
      title: { values: { fr: "x" }, meta: {} },
      equipments,
      tags,
      timings,
      userId,
      shuffleKey,
      isVegan,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
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
    settledAt,
  }: {
    seed?: number;
    plates?: number;
    diet?: Diet;
    avoids?: Allergen[];
    maxMinutes?: number;
    equipments?: Equipment[];
    seeks?: NutritionPreference[];
    settledAt?: number;
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
      settledAt,
    });
    return pool.candidates.map(({ recipeId, isMine }) => ({ recipeId, isMine }));
  });

const idsOf = (candidates: { recipeId: Id<"recipes"> }[]) => candidates.map(({ recipeId }) => recipeId);

/** The instant just past every row written so far — `_creationTime` is a clock, so let it tick. */
const settle = async () => {
  const at = Date.now() + 1;
  await new Promise((resolve) => setTimeout(resolve, 2));
  return at;
};

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

  /** A recipe the cook deleted is never drawn into a new week, on either side of the wrap. */
  test("never draws an archived recipe", async () => {
    const me = await user();
    const kept = await recipe({ shuffleKey: 1, userId: me });
    await recipe({ shuffleKey: 2, userId: me, isArchived: true });
    await recipe({ shuffleKey: 2 ** 31, userId: me, isArchived: true });

    expect(await poolFor(me, { seed: 0.25 })).toEqual([{ recipeId: kept, isMine: true }]);
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

  /** A jus filled a lunch slot once. Only a recipe known not to be a meal goes: untagged stays. */
  test("drops what is not a lunch or a dinner, and keeps a starter and a recipe with no course", async () => {
    const me = await user();
    const main = await recipe({ shuffleKey: 1, tags: ["main"] });
    const starter = await recipe({ shuffleKey: 2, tags: ["starter", "soup"] });
    const bare = await recipe({ shuffleKey: 3 });
    const excluded: Tag[] = ["side", "pastry", "sauce", "dessert", "drink", "snack", "breakfast"];
    for (const [index, tag] of excluded.entries()) {
      await recipe({ shuffleKey: 10 + index, tags: [tag, "quick"] });
    }

    expect(idsOf(await poolFor(me, { plates: 5 }))).toEqual([main, starter, bare]);
  });

  /** A bourguignon is a main that happens to be mostly sauce; the model may say both. */
  test("keeps a main whatever other course it also carries", async () => {
    const me = await user();
    const bourguignon = await recipe({ shuffleKey: 1, tags: ["main", "sauce"] });
    const grainSalad = await recipe({ shuffleKey: 2, tags: ["side", "main"] });
    await recipe({ shuffleKey: 3, tags: ["sauce"] });

    expect(idsOf(await poolFor(me))).toEqual([bourguignon, grainSalad]);
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

  /**
   * The home shelf shows the first picks of a week-seeded pool, so a recipe written mid-week whose
   * key lands inside the window used to take a pick's place — the same Monday redrew a different
   * shelf on Wednesday. Rows younger than `settledAt` go to the back, in their shuffle order.
   */
  test("examines a recipe written after the week settled last, so the picks stand", async () => {
    const me = await user();
    const keys = [10, 20, 30, 40, 50, 60, 70];
    const standing = await Promise.all(keys.map((shuffleKey) => recipe({ shuffleKey })));
    const settledAt = await settle();
    const latecomer = await recipe({ shuffleKey: 15 });

    expect(idsOf(await poolFor(me, { plates: 1 }))).toEqual([standing[0], latecomer, ...standing.slice(1, 5)]);
    expect(idsOf(await poolFor(me, { plates: 1, settledAt }))).toEqual(standing.slice(0, CANDIDATES_PER_PLATE));
  });

  test("still fills a short pool from recipes written after the week settled", async () => {
    const me = await user();
    const standing = await Promise.all([10, 20].map((shuffleKey) => recipe({ shuffleKey })));
    const settledAt = await settle();
    const latecomer = await recipe({ shuffleKey: 15 });

    expect(idsOf(await poolFor(me, { plates: 1, settledAt }))).toEqual([...standing, latecomer]);
  });

  /** The cut is an addition to the pool: one that cannot be read must cost it nothing, not everything. */
  test("leaves the window as it was when the cut cannot be read", async () => {
    const me = await user();
    const keys = [10, 20, 30];
    const standing = await Promise.all(keys.map((shuffleKey) => recipe({ shuffleKey })));

    expect(idsOf(await poolFor(me, { plates: 1, settledAt: Number.NaN }))).toEqual(standing);
  });

  test("keeps latecomers in shuffle order among themselves", async () => {
    const me = await user();
    const standing = await recipe({ shuffleKey: 40 });
    const settledAt = await settle();
    const late = await Promise.all([30, 10, 20].map((shuffleKey) => recipe({ shuffleKey })));

    expect(idsOf(await poolFor(me, { plates: 1, settledAt }))).toEqual([standing, late[1], late[2], late[0]]);
  });
});
