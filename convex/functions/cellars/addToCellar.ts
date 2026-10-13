import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";

import { removeFromRecentlyUsed } from "./removeFromRecentlyUsed";

const DAY_MS = 24 * 60 * 60 * 1000;

/** At or under this share of its shelf life left, a row's older stock is taken as eaten. */
const STALE_SHARE = 1 / 3;

/** A purchase this many times what the row holds swamps the older stock. */
const SWAMP_FACTOR = 3;

type Args = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
  unit: Unit;
  quantity: number;
  /**
   * `false` puts the stock back without striking anything off the list. For the undo of a removal:
   * nothing was bought, so a grocery line for the same food is still wanted. Omitted is a purchase.
   */
  strikeList?: boolean;
};

export type AddedToCellar = {
  /** The row the quantity ended up on, whether it was merged or minted. */
  cellarItemId: Id<"cellarItems">;
  /**
   * How much of the quantity struck grocery lines, in `unit`. What an undo gives back to the list,
   * and the only moment it can be known: the lines it struck are deleted.
   */
  struck: number;
  /** How many list rows it struck or shortened, for the router to report. */
  struckLines: number;
  /** The ingredient row it read for the shelf life, handed on so the report does not read it again. */
  ingredient: Doc<"ingredients"> | null;
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
 * The row is dated from the ingredient's `shelfLifeDays`, the only thing that ever writes
 * `expirationDate`. A merge into an existing row follows `_mergedExpiration`.
 *
 * A struck line may have been carrying a plan's claim — the ledger row `syncMealLines` wrote when
 * the week was committed. Buying **settles** the claim: the food is here now, so the ledger stops
 * naming the list row and names the lot the purchase landed in instead. This is what the undo
 * reads — `removeFromCellar`, given the purchase back within the undo window, finds these rows by
 * their lot and re-links them to the row the restore lands on. Left stale instead, the pointer
 * would name a row that is gone; every reader copes with that, but the undo would have nothing to
 * re-link, and dropping the meal later would give nothing back.
 */
/**
 * The date a row carries once a purchase has merged into it.
 *
 * One row holds stock bought on different days, and it can only carry one date. Keeping the older
 * date is right while the older stock is a real share of the row, since it still goes off first.
 * It stops being right in two cases, and there the row takes the new purchase's date:
 *
 * - **Stale by time:** a third or less of the shelf life is left (expired included). By then the
 *   older stock is assumed eaten, and what is on the shelf is the new purchase.
 * - **Swamped by quantity:** the purchase is at least three times what the row still holds, a row
 *   at 0 included. What remains is mostly the new purchase.
 *
 * An undated row takes the new date. An ingredient with no `shelfLifeDays` leaves the row as it
 * was, since there is no new date to give it.
 *
 * Milk at 90 days, nothing drunk in between: 4 on day 0 dates the row day 90; +1 on day 30 keeps
 * it (60 days left, and 1 < 12); +1 on day 60 moves it to day 150 (30 days left is a third); +20
 * on day 90 moves it to day 180 (20 ≥ 18).
 *
 * @limitation The row takes the NEWEST purchase's date, not the one bought just before it. On
 * day 60 above, the day-30 carton is still in the row and goes off on day 120, not 150. Accepted:
 * that carton carried the older date for a month, so the planner has already been using it up.
 *
 * @limitation An undo cannot put the older date back. The merge overwrites it and nothing keeps
 * a copy, so undoing a purchase that moved the date (`removeFromCellar`) leaves the older stock
 * with the newer date, and it reads as less urgent than it is. Accepted: it needs an undo right
 * after a purchase that moved the date, and the next purchase that finds the row stale corrects it.
 */
const _mergedExpiration = (
  row: Doc<"cellarItems">,
  purchased: number,
  shelfLifeDays: number | undefined,
  now: number,
): number | undefined => {
  if (shelfLifeDays === undefined) return row.expirationDate;

  const fresh = now + shelfLifeDays * DAY_MS;

  if (row.expirationDate === undefined) return fresh;

  const stale = row.expirationDate - now <= shelfLifeDays * DAY_MS * STALE_SHARE;
  const swamped = purchased >= SWAMP_FACTOR * row.quantity;

  return stale || swamped ? fresh : Math.min(row.expirationDate, fresh);
};

export const addToCellar = async (
  ctx: MutationCtx,
  args: Args,
): Promise<AddedToCellar> => {
  const groceryListItems = args.strikeList === false ? [] : await ctx.db
    .query("groceryListItems")
    .withIndex("by_household_id_and_ingredient_id", (q) =>
      q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  const matchingItems = groceryListItems
    .filter((item) => item.unit === args.unit)
    .sort((a, b) => a.quantity - b.quantity);

  /** Only the rows struck whole are settled; a row only decremented keeps its claims pointing at it. */
  const struckRowIds: Id<"groceryListItems">[] = [];

  /** Every list row the purchase struck or shortened: what the cook ticked off. */
  let touchedRows = 0;

  let remainingQuantity = args.quantity;
  for (const groceryListItem of matchingItems) {
    if (remainingQuantity <= 0) break;

    touchedRows += 1;

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

  // A rough date, from how long this food keeps as a shop sells it. Only ever used to decide what
  // to cook first, and absent for an ingredient nothing has estimated, which reads as not urgent.
  const ingredient = await ctx.db.get(args.ingredientId);
  const shelfLifeDays = ingredient?.shelfLifeDays;
  const now = Date.now();

  // The row the quantity ended up on, whether it was merged or minted — the caller asked where its
  // stock went, and "nothing, it merged" is not an answer it can use.
  let cellarItemId: Id<"cellarItems">;
  if (matchingCellarItem) {
    await ctx.db.patch(matchingCellarItem._id, {
      quantity: matchingCellarItem.quantity + args.quantity,
      expirationDate: _mergedExpiration(matchingCellarItem, args.quantity, shelfLifeDays, now),
      updatedAt: now,
    });

    cellarItemId = matchingCellarItem._id;
  } else {
    cellarItemId = await ctx.db.insert("cellarItems", {
      householdId: args.householdId,
      ingredientId: args.ingredientId,
      unit: args.unit,
      quantity: args.quantity,
      expirationDate: shelfLifeDays === undefined ? undefined : now + shelfLifeDays * DAY_MS,
      updatedAt: now,
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

  return { cellarItemId, struck: args.quantity - remainingQuantity, struckLines: touchedRows, ingredient };
};
