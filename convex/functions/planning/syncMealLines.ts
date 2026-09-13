import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { fromStockUnit, stockUnitOf, type Unit } from "@shared/ingredients";

import { addToGroceryList } from "../cellars/addToGroceryList";
import type { Need, Stock } from "./selectMeals";

/** What a line's ingredient has to say about itself: how it converts, and how it is bought. */
export type LineIngredient = Pick<
  Doc<"ingredients">,
  "_id" | "defaultUnit" | "defaultQuantity" | "gramsPerPiece" | "gramsPerMl"
>;

/** One line of a meal: the need, the catalog row behind it, and whether the shopper says they have it. */
export type MealLine = {
  need: Need;
  ingredient: LineIngredient;
  /**
   * The shopper has said this is already in the kitchen, so nothing is bought for it.
   *
   * Their answer, not the cellar's: the cellar is `stock`, and it decides coverage. This only ever
   * suppresses the grocery write — the line still reserves what it reserves, because it still gets
   * cooked.
   */
  owned: boolean;
};

type Args = {
  householdId: Id<"households">;
  plannedMealId: Id<"plannedMeals">;
  lines: MealLine[];
  /**
   * What the cellar can still give, in each ingredient's stock unit — **consumed in place**, so the
   * next meal is scored against what this one left. The caller owns it, and it must not already
   * count this meal's own existing lines: `availableStock` subtracts every planned meal's ledger,
   * this meal's included, so a re-sync passes stock with those lines added back.
   */
  stock: Stock;
  /** The lot each ingredient is reserved against — a hint for a later "what expires first", not an authority. */
  lots: Map<Id<"ingredients">, Id<"cellarItems">>;
};

/** Under this, a remainder is float noise from a conversion rather than something to buy. */
const NOTHING_LEFT = 1e-9;

/** What one line reserves, what is missing from it, and the unit each is counted in. */
type Split = {
  quantity: number;
  unit: Unit;
  /** Whether the kitchen covers the whole line — a pinch by its presence, anything else by amount. */
  covered: boolean;
  /** The part no cellar row covers, in `unit`. Zero for a pinch, which is never part-covered. */
  missing: number;
  /** Whether the line actually took something off the shelf, which is what makes a lot worth naming. */
  reservedStock: boolean;
};

/**
 * A line against the stock it draws on, taking what it uses.
 *
 * Three kinds, three rules, and the unit differs between them — see `Need`. A pinch asks whether the
 * ingredient is there at all and takes nothing, so it reserves `0` and is either covered or bought
 * whole. An unmeasured line cannot reach the stock unit, so it is counted in the recipe's own words
 * and is never covered.
 */
const _split = (need: Need, ingredient: LineIngredient, stock: Stock): Split => {
  const unit = stockUnitOf(ingredient.defaultUnit);

  switch (need.kind) {
    case "pinch":
      return { quantity: 0, unit, covered: stock.has(need.ingredientId), missing: 0, reservedStock: false };

    case "unmeasured":
      return { quantity: need.quantity, unit: need.unit, covered: false, missing: need.quantity, reservedStock: false };

    case "measured": {
      const left = Math.max(0, stock.get(need.ingredientId) ?? 0);
      const used = Math.min(left, need.amount);

      if (used > 0) stock.set(need.ingredientId, left - used);

      const short = need.amount - used;

      return {
        quantity: need.amount,
        unit,
        covered: short <= NOTHING_LEFT,
        missing: short > NOTHING_LEFT ? short : 0,
        reservedStock: used > 0,
      };
    }
  }
};

/**
 * What to buy for a line, in the unit the household shops in — or nothing.
 *
 * A pinch is bought at the ingredient's own `defaultQuantity`: you buy a jar of thyme, not the 1 cc
 * of it the recipe asks for. An unmeasured line is bought in the recipe's words, because that is the
 * only unit it has. Everything else converts out of the stock unit, where `pcs` rounds up.
 */
const _toBuy = ({ need, ingredient }: MealLine, split: Split): { quantity: number; unit: Unit } | null => {
  if (split.covered) return null;

  if (need.kind === "pinch") return { quantity: ingredient.defaultQuantity, unit: ingredient.defaultUnit };
  if (need.kind === "unmeasured") return { quantity: need.quantity, unit: need.unit };

  return { quantity: fromStockUnit(split.missing, ingredient), unit: ingredient.defaultUnit };
};

/**
 * Takes a ledger row's contribution back off the grocery list.
 *
 * Against the row it went onto rather than against the ingredient, because the write it undoes was
 * lossy — it merged with other meals, and it rounded — and `groceryQuantity` is the only record of
 * what actually landed.
 *
 * A row that has since been bought or struck off is simply gone, and there is nothing to give back.
 * Gone rather than detached: `addToCellar` and `removeFromGroceryList` delete the row with
 * `ctx.db.delete`, which does not run the cascade, so the pointer here outlives what it points at
 * and this reads `null`. That is the case the `get` guards, not a defensive nicety.
 *
 * Never below zero: the row may hold less than this line put on it, because somebody edited it.
 */
const _backOut = async (ctx: MutationCtx, row: Doc<"plannedMealIngredients">) => {
  if (!row.groceryListItemId || !row.groceryQuantity) return;

  const item = await ctx.db.get(row.groceryListItemId);
  if (!item) return;

  const left = item.quantity - row.groceryQuantity;

  if (left > NOTHING_LEFT) await ctx.db.patch(item._id, { quantity: left, updatedAt: Date.now() });
  else await ctx.db.delete(item._id);
};

/**
 * Makes a planned meal's ledger equal `lines`, and moves the grocery list by the difference.
 *
 * **The only writer of `plannedMealIngredients`**, and the only place the grocery list learns what a
 * plan needs. Committing a week calls it once per plate; re-scaling or dropping a plate will call it
 * with new lines or with none, and the list follows either way — which is why it replaces rather
 * than appends, and why every row it deletes gives its `groceryQuantity` back first.
 *
 * The lines are walked in order and `stock` is consumed as they go, so a recipe naming an ingredient
 * twice is scored against what its first line left behind.
 */
export const syncMealLines = async (ctx: MutationCtx, { householdId, plannedMealId, lines, stock, lots }: Args) => {
  const existing = await ctx.db
    .query("plannedMealIngredients")
    .withIndex("by_planned_meal", (q) => q.eq("plannedMealId", plannedMealId))
    .collect();

  for (const row of existing) {
    await _backOut(ctx, row);
    await ctx.db.delete(row._id);
  }

  for (const line of lines) {
    const split = _split(line.need, line.ingredient, stock);
    const buying = line.owned ? null : _toBuy(line, split);

    /**
     * A pinch bought once is a pinch the kitchen has, for every plate after it.
     *
     * Presence is the whole of a pinch's arithmetic, so the jar that lands on the list has to make
     * the ingredient present — otherwise each plate asking for thyme finds none and buys another
     * jar, and a week of three such plates orders three. Recorded at `0`: it is a jar nothing has
     * measured, which is exactly what a `Stock` key with nothing behind it means.
     */
    if (line.need.kind === "pinch" && !stock.has(line.need.ingredientId)) {
      stock.set(line.need.ingredientId, 0);
    }

    const groceryListItemId = buying
      ? await addToGroceryList(ctx, {
        householdId,
        ingredientId: line.need.ingredientId,
        quantity: buying.quantity,
        unit: buying.unit,
      })
      : undefined;

    await ctx.db.insert("plannedMealIngredients", {
      plannedMealId,
      ingredientId: line.need.ingredientId,
      sourceQuantity: line.need.quantity,
      sourceUnit: line.need.unit,
      quantity: split.quantity,
      unit: split.unit,
      groceryQuantity: buying?.quantity,
      groceryListItemId,
      cellarItemId: split.reservedStock ? lots.get(line.need.ingredientId) : undefined,
      updatedAt: Date.now(),
    });
  }
};
