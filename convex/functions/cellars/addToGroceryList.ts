import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { convertQuantity, mergeGroupOf, type Unit, unitScale } from "@shared/ingredients";

import { removeFromRecentlyUsed } from "./removeFromRecentlyUsed";

export type GroceryLine = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
  unit: Unit;
  quantity: number;
};

/** Where a write landed, and what it added. */
export type LandedGroceryLine = {
  /** The row the quantity ended up on — merged into or minted. */
  id: Id<"groceryListItems">;
  /** The unit that row holds after the write. */
  unit: Unit;
  /**
   * What THIS write added to that row, in that row's unit. This — not the row's new total, not the
   * caller's raw quantity — is the number a caller records when it may later have to give the
   * quantity back.
   */
  contribution: number;
};

/**
 * The row an incoming line merges into, or `null` when it opens one of its own.
 *
 * An exact unit match wins outright. Failing that, any row of the same merge family will do — and
 * with at most one row per family after this rule has run once, there is at most one to pick. A
 * legacy duplicate from before rows merged across units ties on the most recent write.
 */
const _rowToMergeInto = (rows: Doc<"groceryListItems">[], unit: Unit) => {
  const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  const exact = newest.find((row) => row.unit === unit);
  if (exact) return exact;

  const group = mergeGroupOf(unit);
  if (group === null) return null;

  return newest.find((row) => mergeGroupOf(row.unit) === group) ?? null;
};

/**
 * Moves a row up the unit ladder, and its claims with it.
 *
 * A ledger row's `groceryQuantity` is expressed in the unit of the list row it names, so a row
 * whose unit changes would leave every claim on it in the wrong unit. They are rewritten here, in
 * the same stroke, by the one ratio the row itself moved by — the only place this slice writes to
 * an existing claim.
 */
const _moveRowUp = async (ctx: MutationCtx, row: Doc<"groceryListItems">, unit: Unit) => {
  const quantity = convertQuantity(row.quantity, row.unit, unit)!;

  await ctx.db.patch(row._id, { unit, quantity, updatedAt: Date.now() });

  const claims = await ctx.db
    .query("plannedMealIngredients")
    .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", row._id))
    .collect();

  for (const claim of claims) {
    if (claim.groceryQuantity === undefined) continue;

    await ctx.db.patch(claim._id, {
      groceryQuantity: convertQuantity(claim.groceryQuantity, row.unit, unit)!,
      updatedAt: Date.now(),
    });
  }

  return quantity;
};

/**
 * Puts a quantity on a household's grocery list, merging into the line that already carries this
 * ingredient rather than stacking a second one.
 *
 * **Every write to `groceryListItems` goes through here** — the shopper adding by hand, the planner
 * committing a week, and `removeFromCellar` restoring what an undo took back off the shelf. Lives
 * here rather than in `router/cellars/addToGroceryList.ts` because a router file is not an
 * importable surface for another router.
 *
 * Rows merge across units of one family: 1 kg added onto 500 g reads 1.5 kg, not two tiles for
 * the same flour. The scale decides which unit survives, never recency — the bigger of the row's
 * unit and the incoming one, so a row's unit only ever moves **up** the ladder (mg → g → kg). The
 * incoming quantity is converted into the surviving unit, and the write reports what it added in
 * that unit, because that is what a caller has to give back later.
 */
export const addToGroceryList = async (ctx: MutationCtx, args: GroceryLine): Promise<LandedGroceryLine> => {
  const groceryListItems = await ctx.db.query("groceryListItems")
    .withIndex("by_household_id_and_ingredient_id", q => q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  const row = _rowToMergeInto(groceryListItems, args.unit);

  // Recently-used holds what the household has neither on the shelf nor on the list. It is now on
  // the list either way, so this runs before the merge returns — an ingredient already on the list
  // is exactly the case a stale recently-used row survives.
  await removeFromRecentlyUsed(ctx, args);

  if (!row) {
    const id = await ctx.db.insert("groceryListItems", {
      householdId: args.householdId,
      ingredientId: args.ingredientId,
      unit: args.unit,
      quantity: args.quantity,
      updatedAt: Date.now(),
    });

    return { id, unit: args.unit, contribution: args.quantity };
  }

  if (row.unit === args.unit) {
    await ctx.db.patch(row._id, { quantity: row.quantity + args.quantity, updatedAt: Date.now() });

    return { id: row._id, unit: args.unit, contribution: args.quantity };
  }

  // Both units are in one merge family from here on, so every conversion below is defined.
  const incomingOutranksRow = unitScale(args.unit)! > unitScale(row.unit)!;
  const unit = incomingOutranksRow ? args.unit : row.unit;
  const held = incomingOutranksRow ? await _moveRowUp(ctx, row, unit) : row.quantity;
  const contribution = convertQuantity(args.quantity, args.unit, unit)!;

  await ctx.db.patch(row._id, { quantity: held + contribution, updatedAt: Date.now() });

  return { id: row._id, unit, contribution };
};
