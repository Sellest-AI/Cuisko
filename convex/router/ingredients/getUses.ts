import { internalQuery } from "@convex/procedures";
import { v } from "convex/values";

/** Lines read per repair: the prompt shows 3 per unit, and a row in more units than 10 is rare. */
const MAX_LINES = 30;

/**
 * Every line of a live recipe that writes this catalog row, with the recipe's title: "30 pcs" in
 * "Vietnamese Caramel Pork". `repairIngredient` shows them to the model, so "1 pcs" of yogurt reads
 * as a pot and "2 tbsp" of parsley as a spoonful chopped.
 *
 * Reads the newest `MAX_LINES` lines only, so a staple a thousand recipes use costs the same read
 * as a rare spice. Newest first: a repair runs because a save just linked a line, and that line is
 * the one that asked for the weight. Archived recipes are dropped by hand after the point reads (ADR 0017): they are reached by id,
 * not by a `recipes` query. The title is the English one where it exists: the repair prompt is in
 * English, and a title is context, not text the cook reads.
 */
export const _internal = internalQuery({
  args: { ingredientId: v.id("ingredients") },
  handler: async (ctx, { ingredientId }) => {
    const lines = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_ingredient", (q) => q.eq("ingredientId", ingredientId))
      .order("desc")
      .take(MAX_LINES);
    const recipes = await Promise.all([...new Set(lines.map(({ recipeId }) => recipeId))].map((id) => ctx.db.get(id)));
    const titles = new Map(
      recipes.flatMap((recipe) => {
        if (!recipe || recipe.isArchived) return [];
        const { values } = recipe.title;

        return [[recipe._id, values.en ?? values.fr ?? Object.values(values)[0] ?? ""] as const];
      }),
    );

    return lines.flatMap(({ recipeId, quantity, unit }) => {
      const recipeTitle = titles.get(recipeId);

      return recipeTitle === undefined ? [] : [{ quantity, unit, recipeTitle }];
    });
  },
});
