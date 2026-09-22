import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Unit } from "@shared/ingredients";

import schema from "../../../schema";
import { scaleLines } from "../../planning/scaleLines";
import type { Need } from "../../planning/selectMeals";
import { consumeFromCellar } from "../consumeFromCellar";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const household = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() }));

type IngredientFacts = Partial<
  Pick<Doc<"ingredients">, "defaultUnit" | "defaultQuantity" | "gramsPerPiece" | "gramsPerSlice" | "gramsPerMl">
>;

const ingredient = async (facts: IngredientFacts = {}) => {
  const id = await t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "x", en: "x" }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: 500,
      ...facts,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    }),
  );

  return { _id: id, defaultUnit: "g" as Unit, defaultQuantity: 500, ...facts };
};

const stock = (householdId: Id<"households">, ingredientId: Id<"ingredients">, quantity: number, unit: Unit, expirationDate?: number) =>
  t.run((ctx) => ctx.db.insert("cellarItems", { householdId, ingredientId, quantity, unit, expirationDate, updatedAt: Date.now() }));

const measured = (ingredientId: Id<"ingredients">, amount: number, unit: Unit = "g"): Need =>
  ({ kind: "measured", ingredientId, quantity: amount, unit, amount });

const cellarOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => (await ctx.db.query("cellarItems").collect()).filter((row) => row.householdId === householdId));

const recentlyUsedOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => (await ctx.db.query("recentlyUsedIngredients").collect()).filter((row) => row.householdId === householdId));

const cook = (householdId: Id<"households">, lines: Parameters<typeof consumeFromCellar>[1]["lines"], lots = new Map()) =>
  t.run((ctx) => consumeFromCellar(ctx, { householdId, lines, lots }));

describe("functions/cellars/consumeFromCellar", () => {
  describe("taking", () => {
    test("500 g of pasta minus 200 g leaves 300 g", async () => {
      const home = await household();
      const pasta = await ingredient();
      await stock(home, pasta._id, 500, "g");

      const consumed = await cook(home, [{ need: measured(pasta._id, 200), ingredient: pasta }]);

      expect(consumed).toEqual([{ ingredientId: pasta._id, quantity: 200, unit: "g" }]);
      expect(await cellarOf(home)).toMatchObject([{ quantity: 300, unit: "g" }]);
    });

    /** A row kept in kilos is read in grams and written back in kilos, with nothing lost. */
    test("a row in another unit of the family is charged and kept in its own unit", async () => {
      const home = await household();
      const flour = await ingredient();
      await stock(home, flour._id, 2, "kg");

      await cook(home, [{ need: measured(flour._id, 500), ingredient: flour }]);

      expect(await cellarOf(home)).toMatchObject([{ quantity: 1.5, unit: "kg" }]);
    });

    test("a shelf holding less than asked is emptied, and what was taken is reported", async () => {
      const home = await household();
      const rice = await ingredient();
      await stock(home, rice._id, 150, "g");

      const consumed = await cook(home, [{ need: measured(rice._id, 400), ingredient: rice }]);

      expect(consumed).toEqual([{ ingredientId: rice._id, quantity: 150, unit: "g" }]);
      expect(await cellarOf(home)).toEqual([]);
    });

    test("a pinch takes nothing", async () => {
      const home = await household();
      const thyme = await ingredient({ defaultQuantity: 20 });
      await stock(home, thyme._id, 20, "g");

      const consumed = await cook(home, [{ need: { kind: "pinch", ingredientId: thyme._id, quantity: 1, unit: "tsp" }, ingredient: thyme }]);

      expect(consumed).toEqual([{ ingredientId: thyme._id, quantity: 0, unit: "g" }]);
      expect(await cellarOf(home)).toMatchObject([{ quantity: 20 }]);
    });

    test("an unmeasured line takes nothing", async () => {
      const home = await household();
      const carrots = await ingredient({ defaultUnit: "g" });
      await stock(home, carrots._id, 500, "g");

      const consumed = await cook(home, [{ need: { kind: "unmeasured", ingredientId: carrots._id, quantity: 2, unit: "pcs" }, ingredient: carrots }]);

      expect(consumed).toEqual([{ ingredientId: carrots._id, quantity: 0, unit: "g" }]);
      expect(await cellarOf(home)).toMatchObject([{ quantity: 500 }]);
    });

    test("a row that cannot reach the stock unit is left alone", async () => {
      const home = await household();
      const carrots = await ingredient({ defaultUnit: "g" });
      await stock(home, carrots._id, 3, "pcs");
      await stock(home, carrots._id, 400, "g");

      await cook(home, [{ need: measured(carrots._id, 100), ingredient: carrots }]);

      expect(await cellarOf(home)).toMatchObject([{ quantity: 3, unit: "pcs" }, { quantity: 300, unit: "g" }]);
    });
  });

  describe("dregs", () => {
    /** 30 cl minus 25 cl is 5 cl: a fifth of a 25 cl brick, and not worth a row. */
    test("30 cl of cream minus 25 cl is gone, and remembered as used up", async () => {
      const home = await household();
      const cream = await ingredient({ defaultUnit: "cl", defaultQuantity: 25 });
      await stock(home, cream._id, 30, "cl");

      await cook(home, [{ need: measured(cream._id, 250, "ml"), ingredient: cream }]);

      expect(await cellarOf(home)).toEqual([]);
      expect(await recentlyUsedOf(home)).toMatchObject([{ ingredientId: cream._id, quantity: 30, unit: "cl" }]);
    });

    test("a hair over a fifth of the pack is kept; exactly a fifth is dregs", async () => {
      const home = await household();
      const sugar = await ingredient({ defaultQuantity: 1000 });
      await stock(home, sugar._id, 200, "g");
      await stock(home, sugar._id, 202, "g", 1);

      // The row expiring first (202 g) is drained first: 201 g left, and kept.
      await cook(home, [{ need: measured(sugar._id, 1), ingredient: sugar }]);
      expect((await cellarOf(home)).map((row) => row.quantity).sort()).toEqual([200, 201]);

      // Drained again: 200 g left, a fifth of the pack, and gone.
      await cook(home, [{ need: measured(sugar._id, 1), ingredient: sugar }]);
      expect((await cellarOf(home)).map((row) => row.quantity)).toEqual([200]);
    });

    test("half a tomato is kept", async () => {
      const home = await household();
      const tomato = await ingredient({ defaultUnit: "pcs", defaultQuantity: 6 });
      await stock(home, tomato._id, 1, "pcs");

      await cook(home, [{ need: measured(tomato._id, 0.5, "pcs"), ingredient: tomato }]);

      expect(await cellarOf(home)).toMatchObject([{ quantity: 0.5, unit: "pcs" }]);
    });

    test("a third of a tomato is not", async () => {
      const home = await household();
      const tomato = await ingredient({ defaultUnit: "pcs", defaultQuantity: 6 });
      await stock(home, tomato._id, 1, "pcs");

      await cook(home, [{ need: measured(tomato._id, 2 / 3, "pcs"), ingredient: tomato }]);

      expect(await cellarOf(home)).toEqual([]);
    });

    /**
     * A recipe counts slices; the cellar counts loaves. The need is built the way planning builds
     * it — through `scaleLines`, so the slice-to-loaf ratio is derived from the two weights and
     * not typed into this test — and then judged as pieces: 14 of a loaf's 15 slices leave a
     * fifteenth, which is not a loaf, so the row is finished and remembered.
     */
    test("fourteen of a loaf's fifteen slices finish the loaf", async () => {
      const home = await household();
      const bread = await ingredient({ defaultUnit: "pcs", defaultQuantity: 1, gramsPerPiece: 250, gramsPerSlice: 250 / 15 });
      await stock(home, bread._id, 1, "pcs");

      const [need] = scaleLines(
        [{ ingredientId: bread._id, quantity: 14, unit: "slice", ingredient: { ...bread, category: "GRAIN" } }],
        { recipeServings: 4, servings: 4 },
      );
      expect(need).toMatchObject({ kind: "measured", unit: "slice" });

      await cook(home, [{ need: need!, ingredient: bread }]);

      expect(await cellarOf(home)).toEqual([]);
      expect(await recentlyUsedOf(home)).toMatchObject([{ ingredientId: bread._id, quantity: 1, unit: "pcs" }]);
    });

    /** Six slices of fifteen leave three fifths of a loaf: more than half a piece, so it stays. */
    test("six of a loaf's fifteen slices leave the rest of the loaf", async () => {
      const home = await household();
      const bread = await ingredient({ defaultUnit: "pcs", defaultQuantity: 1, gramsPerPiece: 250, gramsPerSlice: 250 / 15 });
      await stock(home, bread._id, 1, "pcs");

      const [need] = scaleLines(
        [{ ingredientId: bread._id, quantity: 6, unit: "slice", ingredient: { ...bread, category: "GRAIN" } }],
        { recipeServings: 4, servings: 4 },
      );

      await cook(home, [{ need: need!, ingredient: bread }]);

      const [row] = await cellarOf(home);
      expect(row?.unit).toBe("pcs");
      expect(row?.quantity).toBeCloseTo(0.6);
    });

    test("an emptied row replaces an older recently-used entry rather than doubling it", async () => {
      const home = await household();
      const pasta = await ingredient();
      await t.run((ctx) => ctx.db.insert("recentlyUsedIngredients", { householdId: home, ingredientId: pasta._id, quantity: 1, unit: "kg", updatedAt: 1 }));
      await stock(home, pasta._id, 200, "g");

      await cook(home, [{ need: measured(pasta._id, 200), ingredient: pasta }]);

      expect(await recentlyUsedOf(home)).toMatchObject([{ quantity: 200, unit: "g" }]);
    });
  });

  describe("order", () => {
    test("the plan's lot is drained first, whatever expires when", async () => {
      const home = await household();
      const milk = await ingredient({ defaultUnit: "ml", defaultQuantity: 1000 });
      const soon = await stock(home, milk._id, 1000, "ml", 1);
      const lot = await stock(home, milk._id, 1000, "ml", 9);

      await cook(home, [{ need: measured(milk._id, 300, "ml"), ingredient: milk }], new Map([[milk._id, lot]]));

      const rows = await cellarOf(home);
      expect(rows.find((row) => row._id === lot)).toMatchObject({ quantity: 700 });
      expect(rows.find((row) => row._id === soon)).toMatchObject({ quantity: 1000 });
    });

    test("without a lot, the earliest expiry goes first, then a row with none", async () => {
      const home = await household();
      const milk = await ingredient({ defaultUnit: "ml", defaultQuantity: 1000 });
      const open = await stock(home, milk._id, 1000, "ml");
      const soon = await stock(home, milk._id, 500, "ml", 1);

      await cook(home, [{ need: measured(milk._id, 800, "ml"), ingredient: milk }]);

      const rows = await cellarOf(home);
      expect(rows.find((row) => row._id === soon)).toBeUndefined();
      expect(rows.find((row) => row._id === open)).toMatchObject({ quantity: 700 });
    });

    test("a recipe naming an ingredient twice is charged twice", async () => {
      const home = await household();
      const butter = await ingredient();
      await stock(home, butter._id, 500, "g");

      await cook(home, [
        { need: measured(butter._id, 100), ingredient: butter },
        { need: measured(butter._id, 50), ingredient: butter },
      ]);

      expect(await cellarOf(home)).toMatchObject([{ quantity: 350 }]);
    });
  });
});
