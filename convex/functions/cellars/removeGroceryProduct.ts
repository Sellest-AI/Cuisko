import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { ConvexError } from "convex/values";

type Args = {
  householdId: Id<"households">;
  productId: Id<"groceryProducts">;
};

/**
 * Takes a product off the list: the tap that says it was bought, which is also the end of it, since
 * a product never reaches the cellar.
 *
 * `householdMutation` proves the caller belongs to `householdId`, not that the row does, so that is
 * compared here. A row already gone is not an error: two members in the same aisle can tap the same
 * card, and the second has nothing left to report.
 *
 * Returns whether a row went, for the router to report only then.
 *
 * @limitation No undo. A mistap means typing the word again, as asked for this slice.
 */
export const removeGroceryProduct = async (ctx: MutationCtx, args: Args): Promise<boolean> => {
  const row = await ctx.db.get(args.productId);
  if (!row) return false;

  if (row.householdId !== args.householdId) throw new ConvexError({ code: "FORBIDDEN" });

  await ctx.db.delete(row._id);

  return true;
};
