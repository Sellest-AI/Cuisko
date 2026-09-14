import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";
import { ConvexError } from "convex/values";

import { cascadeDelete } from "../cascade";

type Args = {
  householdId: Id<"households">;
  ingredientId: Id<"ingredients">;
  unit: Unit;
};

/**
 * Strikes an ingredient off a household's list entirely — the "no, we don't need this" gesture,
 * as opposed to buying it.
 *
 * Every line in this unit goes, not the first: the shopper is saying they do not want the
 * ingredient, and leaving a second line standing would answer a question they did not ask. Lines
 * in *other* units are left alone, because 500 g of flour and 2 bags of flour are two decisions.
 *
 * The rows go through the cascade rather than bare, so a plan's claim pointing at one loses the
 * pointer with the row instead of naming a ghost. The claim itself stays settled — the shopper
 * overruled the list, and a later meal drop giving the grocery quantity back would put the row
 * straight back up. A reservation the claim held against a cellar lot stands: the line still gets
 * cooked either way.
 */
export const removeFromGroceryList = async (ctx: MutationCtx, args: Args): Promise<void> => {
  const items = await ctx.db
    .query("groceryListItems")
    .withIndex("by_household_id_and_ingredient_id", (q) =>
      q.eq("householdId", args.householdId).eq("ingredientId", args.ingredientId))
    .collect();

  const matching = items.filter((item) => item.unit === args.unit);
  if (!matching.length) throw new ConvexError({ code: "NOT_FOUND", message: "No grocery line to remove." });

  for (const item of matching) {
    await cascadeDelete(ctx, "groceryListItems", item._id);
  }
};
