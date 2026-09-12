import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";

import schema from "../../../schema";
import { candidatePool } from "../candidatePool";

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
};

/** A recipe of one line. Keys are 32-bit integers, as `randomShuffleKey` draws them. */
const recipe = ({ shuffleKey, userId, isVegan = true, allergens: classified = [] }: RecipeFacts) =>
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
      timings: {},
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
  { seed = 0, plates = 2, diet = "omnivore", avoids = [] }: { seed?: number; plates?: number; diet?: Diet; avoids?: Allergen[] } = {},
) =>
  t.run(async (ctx) => {
    const pool = await candidatePool(ctx, { userId, seed, servings: 2, plates, diet, avoids });
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
    for (let key = 1; key <= 5; key++) await recipe({ shuffleKey: key });

    expect(await poolFor(me, { plates: 1 })).toHaveLength(3);
  });
});
