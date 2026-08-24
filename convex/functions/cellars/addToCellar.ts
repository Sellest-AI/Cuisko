import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";

import { removeFromRecentlyUsed } from "./removeFromRecentlyUsed";

type Args = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
  unit: Unit;
  quantity: number;
};

/**
 * Puts a quantity on a household's shelf, and strikes off whatever it was on the list for.
 *
 * Grocery lines are consumed **smallest first**. The alternative — largest first — settles the
 * same total but leaves a scatter of small lines behind, so a shopper who buys most of what they
 * wrote down still sees a full-looking list. Smallest first clears whole lines as it goes, and
 * what remains is the one big thing still outstanding.
 *
 * A purchase larger than everything written down simply runs out of lines to strike; the surplus
 * goes on the shelf, and deciding whether that was a mistake is the client's, not this function's.
 */
export const addToCellar = async (
  ctx: MutationCtx,
  args: Args,
): Promise<Id<"cellarItems">> => {
  const groceryListItems = await ctx.db
    .query("groceryListItems")
    .withIndex("by_household_id_and_ingredient_id", (q) =>
      q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  const matchingItems = groceryListItems
    .filter((item) => item.unit === args.unit)
    .sort((a, b) => a.quantity - b.quantity);

  let remainingQuantity = args.quantity;
  for (const groceryListItem of matchingItems) {
    if (remainingQuantity <= 0) break;

    if (groceryListItem.quantity <= remainingQuantity) {
      await ctx.db.delete(groceryListItem._id);
      remainingQuantity -= groceryListItem.quantity;
    } else {
      await ctx.db.patch(groceryListItem._id, {
        quantity: groceryListItem.quantity - remainingQuantity,
        updatedAt: Date.now(),
      });
      remainingQuantity = 0;
    }
  }

  // Recently-used is what the household has neither on the shelf nor on the list. It is now on the
  // shelf, so it is no longer a memory.
  await removeFromRecentlyUsed(ctx, args);

  const existingCellarItems = await ctx.db
    .query("cellarItems")
    .withIndex("by_household_id_and_ingredient_id", (q) =>
      q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  /**
   * TODO - Split by the recipes needing the ingredient: if one recipe wants 2 eggs and another 4,
   * that is two cellar rows, not one of 6. Merging by unit until then.
   */
  const matchingCellarItem = existingCellarItems.find((item) => item.unit === args.unit);

  // The row the quantity ended up on, whether it was merged or minted — the caller asked where its
  // stock went, and "nothing, it merged" is not an answer it can use.
  if (matchingCellarItem) {
    await ctx.db.patch(matchingCellarItem._id, {
      quantity: matchingCellarItem.quantity + args.quantity,
      updatedAt: Date.now(),
    });

    return matchingCellarItem._id;
  }

  return await ctx.db.insert("cellarItems", {
    householdId: args.householdId,
    ingredientId: args.ingredientId,
    unit: args.unit,
    quantity: args.quantity,
    // Nothing on a receipt says when it goes off; the shopper tells us later, or never.
    expirationDate: undefined,
    updatedAt: Date.now(),
  });
};
