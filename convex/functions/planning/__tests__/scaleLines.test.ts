import { describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Category } from "@shared/categories";
import type { Unit } from "@shared/ingredients";

import { scaleLines, type ScalableLine } from "../scaleLines";

const ONION = "onion" as Id<"ingredients">;

const line = (
  quantity: number,
  unit: Unit,
  ingredient: Partial<ScalableLine["ingredient"]> = {},
): ScalableLine => ({
  ingredientId: ONION,
  quantity,
  unit,
  ingredient: { category: "VEGETABLE", defaultUnit: "g", ...ingredient },
});

describe("functions/planning/scaleLines", () => {
  describe("scaling", () => {
    test("scales by servings over the recipe's servings", () => {
      const [need] = scaleLines([line(200, "g")], { recipeServings: 2, servings: 3 });

      expect(need).toMatchObject({ quantity: 300, unit: "g", kind: "measured", amount: 300 });
    });

    /** 1 onion for 3, cooked for 4, is two onions — 300 g of them, for an onion bought by weight. */
    test("rounds pieces up to a whole, and converts the rounded count", () => {
      const [need] = scaleLines([line(1, "pcs", { gramsPerPiece: 150 })], {
        recipeServings: 3,
        servings: 4,
      });

      expect(need).toMatchObject({ quantity: 2, unit: "pcs", amount: 300 });
    });

    /** A third scaled by three is 1.0000000000000002 in floating point, and must stay one onion. */
    test("does not round float noise up to an extra piece", () => {
      const [need] = scaleLines([line(1 / 3, "pcs", { gramsPerPiece: 150 })], {
        recipeServings: 1,
        servings: 3,
      });

      expect(need?.quantity).toBe(1);
    });
  });

  describe("the stock unit", () => {
    test("measures in grams an ingredient bought by mass", () => {
      const [need] = scaleLines([line(1, "kg")], { recipeServings: 1, servings: 1 });

      expect(need).toMatchObject({ kind: "measured", amount: 1000 });
    });

    /** Milk is bought in millilitres, so a litre of it needs no density to be compared. */
    test("measures in millilitres an ingredient bought by volume, with no density", () => {
      const [need] = scaleLines([line(1, "l", { category: "DAIRY", defaultUnit: "ml" })], {
        recipeServings: 1,
        servings: 1,
      });

      expect(need).toMatchObject({ kind: "measured", amount: 1000 });
    });

    /** Carrots are bought by the piece, so three of them need no piece weight to be compared. */
    test("measures in pieces an ingredient bought by the piece, with no piece weight", () => {
      const [need] = scaleLines([line(3, "pcs", { defaultUnit: "pcs" })], {
        recipeServings: 1,
        servings: 1,
      });

      expect(need).toMatchObject({ kind: "measured", amount: 3 });
    });

    test("leaves a line unmeasured when it cannot reach the stock unit, in its own unit", () => {
      const [need] = scaleLines([line(2, "pcs")], { recipeServings: 1, servings: 1 });

      expect(need).toEqual({ ingredientId: ONION, quantity: 2, unit: "pcs", kind: "unmeasured" });
    });
  });

  describe("staples", () => {
    test.each<[Category, Unit]>([
      ["SPICE", "cc"],
      ["HERB", "pcs"],
      ["CONDIMENT", "cs"],
      ["OIL", "cs"],
      ["SWEETENER", "cc"],
    ])("reads a %s in %s as a pinch, never measured", (category, unit) => {
      const [need] = scaleLines([line(1, unit, { category, gramsPerPiece: 5, gramsPerMl: 1 })], {
        recipeServings: 1,
        servings: 1,
      });

      expect(need?.kind).toBe("pinch");
    });

    /** The recipe's words survive, so the meal screen can still say "2 cc". */
    test("keeps the pinch's scaled amount for display", () => {
      const [need] = scaleLines([line(1, "cc", { category: "SPICE" })], {
        recipeServings: 2,
        servings: 4,
      });

      expect(need).toMatchObject({ quantity: 2, unit: "cc" });
    });

    /** The unit decides, not the category: 200 g of sugar is a real quantity. */
    test("counts a staple written in grams normally", () => {
      const [need] = scaleLines([line(200, "g", { category: "SWEETENER" })], {
        recipeServings: 1,
        servings: 1,
      });

      expect(need).toMatchObject({ kind: "measured", amount: 200 });
    });

    test("does not treat a spoonful of a non-staple as a pinch", () => {
      const [need] = scaleLines([line(1, "cs", { category: "DAIRY", gramsPerMl: 1 })], {
        recipeServings: 1,
        servings: 1,
      });

      expect(need).toMatchObject({ kind: "measured", amount: 15 });
    });
  });
});
