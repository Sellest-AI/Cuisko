import type { Id } from "@convex/_generated/dataModel";
import type { Category } from "@shared/categories";
import { toStockUnit, type GramWeights, type Unit } from "@shared/ingredients";

import type { Need } from "./selectMeals";

/** One `recipeIngredients` row, with the catalog facts its scaling needs joined on. */
export type ScalableLine = {
  ingredientId: Id<"ingredients">;
  quantity: number;
  unit: Unit;
  ingredient: GramWeights & { category: Category; defaultUnit: Unit };
};

type Args = {
  /** What the recipe is written for. */
  recipeServings: number;
  /** What the plate is cooked for. */
  servings: number;
};

/** The categories a spoonful or a sprig of is a pinch — kept on hand, not measured out. */
const PINCH_CATEGORIES: ReadonlySet<Category> = new Set(["SPICE", "HERB", "CONDIMENT", "OIL", "SWEETENER"]);

/**
 * The units that make a staple a pinch. The unit decides, not the category alone: 1 cc of cinnamon
 * is a pinch, and 200 g of sugar in the same cake is a real quantity measured like any other.
 */
const PINCH_UNITS: ReadonlySet<Unit> = new Set(["cs", "cc", "pcs"]);

/**
 * Absorbs the float noise a ratio leaves behind before rounding a piece count up. Without it, a
 * third of an onion scaled by three is `1.0000000000000002` and rounds to two onions.
 */
const PIECE_EPSILON = 1e-9;

/**
 * A recipe's lines, at the servings a plate is cooked for, in each ingredient's stock unit where
 * they can reach it.
 *
 * Pieces round up to a whole: nobody buys or reserves 0.67 of an onion, and the amount is taken
 * from the rounded count so the reservation matches what gets cut.
 *
 * A pinch is never measured — it asks the cellar whether the ingredient is there, not how much — so
 * a sprig of thyme is a pinch whatever the catalog knows about it. A line that is not a pinch and
 * cannot reach the stock unit keeps its own unit and is `unmeasured`, never covered.
 */
export const scaleLines = (lines: ScalableLine[], { recipeServings, servings }: Args): Need[] =>
  lines.map(({ ingredientId, quantity, unit, ingredient }) => {
    /**
     * A recipe written for nobody is broken data, and dividing by it would poison every line with
     * Infinity. Scaling such a line by one keeps the plan alive — the same answer the line would
     * get from servings equal to the recipe's, and the least surprising recovery available.
     */
    const exact = recipeServings > 0 ? (quantity * servings) / recipeServings : quantity;
    const scaled = unit === "pcs" ? Math.ceil(exact - PIECE_EPSILON) : exact;
    const line = { ingredientId, quantity: scaled, unit };

    if (PINCH_CATEGORIES.has(ingredient.category) && PINCH_UNITS.has(unit)) {
      return { ...line, kind: "pinch" };
    }

    const amount = toStockUnit(scaled, unit, ingredient);
    return amount === undefined ? { ...line, kind: "unmeasured" } : { ...line, kind: "measured", amount };
  });
