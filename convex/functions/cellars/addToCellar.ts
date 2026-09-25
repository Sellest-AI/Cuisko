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
 *
 * A struck line may have been carrying a plan's claim — the ledger row `syncMealLines` wrote when
 * the week was committed. Buying **settles** the claim: the food is here now, so the ledger stops
 * naming the list row and names the lot the purchase landed in instead. This is what the undo
 * reads — `removeFromCellar`, given the purchase back within the undo window, finds these rows by
 * their lot and re-links them to the row the restore lands on. Left stale instead, the pointer
 * would name a row that is gone; every reader copes with that, but the undo would have nothing to
 * re-link, and dropping the meal later would give nothing back.
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

  /** Only the rows struck whole are settled; a row only decremented keeps its claims pointing at it. */
  const struckRowIds: Id<"groceryListItems">[] = [];

  let remainingQuantity = args.quantity;
  for (const groceryListItem of matchingItems) {
    if (remainingQuantity <= 0) break;

    if (groceryListItem.quantity <= remainingQuantity) {
      await ctx.db.delete(groceryListItem._id);
      struckRowIds.push(groceryListItem._id);
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
   * @limitation Stock merges by unit, not by the recipe that needs it: one recipe wanting 2 eggs
   * and another 4 make one cellar row of 6, not two. Accepted for now because splitting would
   * need new tests across the whole app. Splitting by the recipes needing the ingredient is the
   * intended fix, for a later update; this merges by unit until then.
   */
  const matchingCellarItem = existingCellarItems.find((item) => item.unit === args.unit);

  // The row the quantity ended up on, whether it was merged or minted — the caller asked where its
  // stock went, and "nothing, it merged" is not an answer it can use.
  let cellarItemId: Id<"cellarItems">;
  if (matchingCellarItem) {
    await ctx.db.patch(matchingCellarItem._id, {
      quantity: matchingCellarItem.quantity + args.quantity,
      updatedAt: Date.now(),
    });

    cellarItemId = matchingCellarItem._id;
  } else {
    cellarItemId = await ctx.db.insert("cellarItems", {
      householdId: args.householdId,
      ingredientId: args.ingredientId,
      unit: args.unit,
      quantity: args.quantity,
      // Nothing on a receipt says when it goes off; the shopper tells us later, or never.
      expirationDate: undefined,
      updatedAt: Date.now(),
    });
  }

  // One patch per claim: the pointer goes, the lot arrives. A claim already reserving against a
  // lot keeps it — the purchase only settles the part that was missing, and the reserved part is
  // still spoken for. `updatedAt` moves with the settlement, which is what lets the undo's
  // recency check tell this purchase's claims from an older one's.
  for (const struckRowId of struckRowIds) {
    const claims = await ctx.db
      .query("plannedMealIngredients")
      .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", struckRowId))
      .collect();

    for (const claim of claims) {
      await ctx.db.patch(claim._id, {
        groceryListItemId: undefined,
        cellarItemId: claim.cellarItemId ?? cellarItemId,
        updatedAt: Date.now(),
      });
    }
  }

  return cellarItemId;
};
