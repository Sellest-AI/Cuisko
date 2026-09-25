import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { UNDO_WINDOW_MS } from "@shared/groceries";
import { convertQuantity, type Unit } from "@shared/ingredients";
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
 * read recency off an `updatedAt` that a 1 g top-up already refreshed. The client holds the receipt
 * for the purchase being undone, so it is the only party that knows what that purchase consumed;
 * `restoreToList` is that decision, passed in.
 *
 * Both writes happen here, in one mutation, so an undo cannot half-apply — what moved to the
 * client is the arithmetic, not the transaction. A wrong `restoreToList` needs no defence beyond
 * the validator: the worst it does is put a wrong amount on the household's own list.
 *
 * When the restore puts a purchase back on the list, the plan's claims that purchase settled come
 * back with it: their ledger rows are re-linked to the row the restore lands on. Without that, a
 * canceled "wrong item" tap would leave the list asking for the meal's ingredient while the ledger
 * believed it bought — and dropping the meal later would strike nothing back off.
 *
 * @limitation The row's `expirationDate` is left as it is. An undo of a purchase that moved the
 * date keeps the newer one, since nothing stored the older one — see `_mergedExpiration` in
 * `addToCellar`.
 */
export const removeFromCellar = async (ctx: MutationCtx, args: Args): Promise<void> => {
  const cellarItems = await ctx.db.query("cellarItems")
    .withIndex("by_household_id_and_ingredient_id", q => q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  const matchingCellarItem = cellarItems
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find(item => item.unit === args.unit);

  if (!matchingCellarItem) throw new ConvexError({ code: "NOT_FOUND", message: "No cellar row to remove." });

  const restored = args.restoreToList ?? 0;

  /**
   * The claims this removal may be unbuying, captured before the row itself moves — emptying it
   * detaches their anchor, and after that there is nothing left to find them by.
   *
   * A claim in the capture names this lot and names no list row: the purchase it settled struck
   * that row, and `addToCellar` anchored the claim to the lot the purchase landed in. Age is what
   * keeps another purchase's claims out — an anchor outlives its purchase, because a later buy
   * merges into the same lot — so only claims settled within the undo window are taken. A claim
   * with a `groceryQuantity` is required because a reservation the week made at commit time names
   * a lot too, and nothing about it was ever bought. Past the window the client sends no
   * `restoreToList` at all, so a wider net here would catch nothing a real undo needs.
   */
  const settledClaims = restored > 0
    ? (await ctx.db
      .query("plannedMealIngredients")
      .withIndex("by_cellar_item", (q) => q.eq("cellarItemId", matchingCellarItem._id))
      .collect())
      .filter((row) =>
        row.groceryQuantity !== undefined &&
        !row.groceryListItemId &&
        Date.now() - row.updatedAt < UNDO_WINDOW_MS)
    : [];

  const emptiesTheRow = args.quantity >= matchingCellarItem.quantity;

  if (emptiesTheRow) {
    await ctx.db.delete(matchingCellarItem._id);
  } else {
    await ctx.db.patch(matchingCellarItem._id, {
      quantity: matchingCellarItem.quantity - args.quantity,
      updatedAt: Date.now(),
    });
  }

  if (restored > 0) {
    const landed = await addToGroceryList(ctx, {
      householdId: args.householdId,
      ingredientId: args.ingredientId,
      unit: args.unit,
      quantity: restored,
    });

    // Each settled claim takes its row back and gives up its lot: the quantity just left the
    // shelf, so the claim is missing again — the shape it had when the week was committed,
    // pointing at the list and at no lot. Dropping the meal later now takes its groceryQuantity
    // back off the restored row, instead of finding a pointer that names nothing.
    //
    // Every captured claim carries its groceryQuantity in `args.unit`: `addToCellar` strikes only
    // rows of the unit it buys in, and a claim's figure is in the unit of the row it named. When
    // the restore merged into a row of another unit, the claims follow it by that one ratio, so
    // the figure stays in the unit of the row the pointer names. Same unit, same figure — `pcs`
    // has no ratio to itself, and the common case must not go through one.
    const crossUnit = landed.unit !== args.unit;

    for (const claim of settledClaims) {
      await ctx.db.patch(claim._id, {
        groceryListItemId: landed.id,
        groceryQuantity: crossUnit ? convertQuantity(claim.groceryQuantity!, args.unit, landed.unit) : claim.groceryQuantity,
        cellarItemId: undefined,
        updatedAt: Date.now(),
      });
    }
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
