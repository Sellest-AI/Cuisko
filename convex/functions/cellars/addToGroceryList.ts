import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";

import { removeFromRecentlyUsed } from "./removeFromRecentlyUsed";

export type GroceryLine = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
  unit: Unit;
  quantity: number;
  expirationDate?: number;
};

/**
 * Puts a quantity on a household's grocery list, merging into the line that already carries this
 * ingredient in this unit rather than stacking a second one.
 *
 * Lives here rather than in `router/cellars/addToGroceryList.ts` because it has two callers: the
 * shopper adding something by hand, and `removeFromCellar` restoring what an undo took back off
 * the shelf. A router file is not an importable surface for another router.
 */
export const addToGroceryList = async (
  ctx: MutationCtx,
  args: GroceryLine,
): Promise<Id<"groceryListItems">> => {
  const groceryListItems = await ctx.db.query("groceryListItems")
    .withIndex("by_household_id_and_ingredient_id", q => q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  /**
   * TODO - Find the item that matches the unit AND isn't linked to a recipe.
   */
  const matchingItem = groceryListItems.find(item => item.unit === args.unit);

  // Recently-used holds what the household has neither on the shelf nor on the list. It is now on
  // the list either way, so this runs before the merge returns — an ingredient already on the list
  // is exactly the case a stale recently-used row survives.
  await removeFromRecentlyUsed(ctx, args);

  if (matchingItem) {
    await ctx.db.patch(matchingItem._id, {
      quantity: matchingItem.quantity + args.quantity,
      updatedAt: Date.now(),
    });

    return matchingItem._id;
  }

  return await ctx.db.insert("groceryListItems", {
    householdId: args.householdId,
    ingredientId: args.ingredientId,
    unit: args.unit,
    quantity: args.quantity,
    updatedAt: Date.now(),
  });
};
