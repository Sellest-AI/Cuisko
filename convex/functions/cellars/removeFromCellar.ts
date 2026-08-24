import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";
import { ConvexError } from "convex/values";

import { addToGroceryList } from "./addToGroceryList";
import { removeFromRecentlyUsed } from "./removeFromRecentlyUsed";

type Args = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
  unit: Unit;
  quantity: number;
  /**
   * How much of the removed quantity goes back on the grocery list. Omitted — or zero — for an
   * ordinary "we used this up".
   */
  restoreToList?: number;
};

/**
 * Takes a quantity off a household's shelf, and optionally puts some of it back on the list.
 *
 * **The server does not decide whether this is an undo.** It used to: any row touched within five
 * minutes had its whole removed quantity re-listed. That rule was wrong three ways — it re-listed
 * quantities nobody had asked for, it double-counted against a plate's still-open claim, and it
 * read recency off an `updatedAt` that a 1 g top-up already refreshed. The client holds the
 * receipt for the purchase being undone, so it is the only party that knows what that purchase
 * consumed; `restoreToList` is that decision, passed in.
 *
 * Both writes happen here, in one mutation, so an undo cannot half-apply — what moved to the
 * client is the arithmetic, not the transaction. A wrong `restoreToList` needs no defence beyond
 * the validator: the worst it does is put a wrong amount on the household's own list.
 */
export const removeFromCellar = async (ctx: MutationCtx, args: Args): Promise<void> => {
  const cellarItems = await ctx.db.query("cellarItems")
    .withIndex("by_household_id_and_ingredient_id", q => q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  const matchingCellarItem = cellarItems
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find(item => item.unit === args.unit);

  if (!matchingCellarItem) throw new ConvexError({ code: "NOT_FOUND", message: "No cellar row to remove." });

  const emptiesTheRow = args.quantity >= matchingCellarItem.quantity;

  if (emptiesTheRow) {
    await ctx.db.delete(matchingCellarItem._id);
  } else {
    await ctx.db.patch(matchingCellarItem._id, {
      quantity: matchingCellarItem.quantity - args.quantity,
      updatedAt: Date.now(),
    });
  }

  const restored = args.restoreToList ?? 0;
  if (restored > 0) {
    await addToGroceryList(ctx, {
      householdId: args.householdId,
      ingredientId: args.ingredientId,
      unit: args.unit,
      quantity: restored,
    });
  }

  /**
   * Running out is what makes an ingredient a suggestion: the row emptied, nothing went back on
   * the list, so the household will want it again. An undo is neither — the quantity is already
   * back on the list, and offering it a second time from recently-used would list it twice.
   */
  if (!emptiesTheRow || restored > 0) return;

  // Make sure to not duplicate the recently used ingredients, so we remove it first if it exists.
  await removeFromRecentlyUsed(ctx, args);

  await ctx.db.insert("recentlyUsedIngredients", {
    householdId: args.householdId,
    ingredientId: args.ingredientId,
    unit: args.unit,
    quantity: args.quantity,
    updatedAt: Date.now(),
  });
};
