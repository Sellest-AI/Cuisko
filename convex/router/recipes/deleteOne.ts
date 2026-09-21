import { ConvexError, v } from "convex/values";
import { cascadeDelete } from "@convex/functions/cascade";
import { internalMutation } from "@convex/procedures";

/**
 * Removes a catalog recipe and everything it owns: its ingredient lines, the favorites pointing at
 * it, the planned meals built on it, and both image trees (cover and plate), files included.
 *
 * Internal, and run by hand from the dashboard: the catalog import has no undo, and a dish that
 * turns out not to be a plate (`docs/PRODUCT.md`) is taken out here, after its ledger entry is
 * marked "excluded" so no later run brings it back. There is no user-facing delete for the catalog.
 *
 * Only a CATALOG recipe: one a cook wrote has a `userId`, and the dashboard form accepts any id,
 * so the mutation refuses rather than trusting the paste. `cascadeDelete` does the rest; deleting
 * the row bare from the dashboard is what would orphan its images and its lines.
 */
export const _internal = internalMutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }) => {
    const recipe = await ctx.db.get(recipeId);
    if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "Recipe not found" });
    if (recipe.userId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not a catalog recipe: it belongs to a cook" });
    }

    await cascadeDelete(ctx, "recipes", recipeId);

    return { deleted: recipe.title.values };
  },
});
