import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { stockUnitOf, toStockUnit, type StockUnit } from "@shared/ingredients";

import type { Need } from "../planning/selectMeals";
import type { LineIngredient } from "../planning/syncMealLines";
import { removeFromRecentlyUsed } from "./removeFromRecentlyUsed";

/**
 * What is left of a row, as a share of the ingredient's default pack, under which the row is not
 * worth keeping: 5 cl of cream at the bottom of a 25 cl brick is a rinse, not a stock — and that
 * case is a fifth, which is where the number comes from.
 *
 * ⚠️ Provisional. Nobody has cooked against it yet; the tests pin it so moving it is one edit.
 */
export const DREGS_RATIO = 0.2;

/** A piece count under this is not a piece: half a tomato is kept, a third of one is not. */
export const MIN_PIECES = 0.5;

/** Under this, a remainder is float noise from a conversion rather than something still needed. */
const NOTHING_LEFT = 1e-9;

/** What one line took, in the ingredient's stock unit — the record a cooked plate's ledger keeps. */
export type Consumed = { ingredientId: Id<"ingredients">; quantity: number; unit: StockUnit };

type Line = { need: Need; ingredient: LineIngredient };

type Args = {
  householdId: Id<"households">;
  lines: Line[];
  /** The lot each line was reserved against when planned — drained first, so a plan's hint is honoured. */
  lots: Map<Id<"ingredients">, Id<"cellarItems">>;
};

/**
 * Whether a row emptied this far is dregs.
 *
 * Pieces are judged as pieces. Everything else against the pack the ingredient is bought in, in the
 * stock unit — `defaultQuantity` is in `defaultUnit`, which shares the stock unit's dimension, so
 * the conversion always resolves.
 */
const _isDregs = (left: number, ingredient: LineIngredient): boolean => {
  if (left <= NOTHING_LEFT) return true;
  if (stockUnitOf(ingredient.defaultUnit) === "pcs") return left < MIN_PIECES;

  const pack = toStockUnit(ingredient.defaultQuantity, ingredient.defaultUnit, ingredient) ?? 0;
  return left <= DREGS_RATIO * pack;
};

/** The order rows are drained in: the plan's lot, then what expires first, then what came first. */
const _drainOrder = (lot: Id<"cellarItems"> | undefined) => (a: Doc<"cellarItems">, b: Doc<"cellarItems">) =>
  Number(b._id === lot) - Number(a._id === lot) ||
  (a.expirationDate ?? Infinity) - (b.expirationDate ?? Infinity) ||
  a._creationTime - b._creationTime;

/**
 * Empties a row the household has used up, and remembers it as something they will want again —
 * the same gesture `removeFromCellar` makes when a removal takes the last of a row.
 */
const _finish = async (ctx: MutationCtx, row: Doc<"cellarItems">) => {
  await ctx.db.delete(row._id);
  await removeFromRecentlyUsed(ctx, { householdId: row.householdId, ingredientId: row.ingredientId });
  await ctx.db.insert("recentlyUsedIngredients", {
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    unit: row.unit,
    quantity: row.quantity,
    updatedAt: Date.now(),
  });
};

/**
 * Takes one measured need out of the rows that hold its ingredient, and says how much it got.
 *
 * Each row is read in the stock unit and written back in its own: the ratio between the two is the
 * row's, so a row kept in a unit the recipe never used comes back in that unit with nothing lost. A
 * row that cannot reach the stock unit — carrots by the piece with no piece weight — is left alone,
 * since nothing can say how much of it a gram is.
 */
const _drain = async (ctx: MutationCtx, householdId: Id<"households">, { need, ingredient }: Line, lot?: Id<"cellarItems">) => {
  if (need.kind !== "measured") return 0;

  const rows = (
    await ctx.db
      .query("cellarItems")
      .withIndex("by_household_id_and_ingredient_id", (q) => q.eq("householdId", householdId).eq("ingredientId", need.ingredientId))
      .collect()
  ).sort(_drainOrder(lot));

  let remaining = need.amount;

  for (const row of rows) {
    if (remaining <= NOTHING_LEFT) break;

    const inStock = toStockUnit(row.quantity, row.unit, ingredient);
    if (inStock === undefined || inStock <= 0) continue;

    const taken = Math.min(inStock, remaining);
    const left = inStock - taken;
    remaining -= taken;

    if (_isDregs(left, ingredient)) await _finish(ctx, row);
    else await ctx.db.patch(row._id, { quantity: left / (inStock / row.quantity), updatedAt: Date.now() });
  }

  return need.amount - remaining;
};

/**
 * Spends a cooked recipe's lines out of the household's cellar.
 *
 * A pinch takes nothing — its arithmetic is presence, and a jar of thyme survives a sprig. An
 * unmeasured line takes nothing either: it never reached the stock unit, so no row can be charged
 * for it. Everything else is drained row by row until the amount is met or the shelf is bare; a
 * shelf that held less than the recipe asked for is simply emptied, because the dish got cooked
 * regardless and the cellar is now wrong by less than it was.
 *
 * Reports what was actually taken, which is what the ledger records — never what was asked for.
 */
export const consumeFromCellar = async (ctx: MutationCtx, { householdId, lines, lots }: Args): Promise<Consumed[]> => {
  const consumed: Consumed[] = [];

  for (const line of lines) {
    const quantity = await _drain(ctx, householdId, line, lots.get(line.need.ingredientId));
    consumed.push({ ingredientId: line.need.ingredientId, quantity, unit: stockUnitOf(line.ingredient.defaultUnit) });
  }

  return consumed;
};
