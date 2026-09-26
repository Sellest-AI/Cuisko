import type { QueryCtx } from "@convex/procedures";

type Args = {
  /** Strings that are meant to be ingredient ids, and may not be. */
  ids: string[];
};

/**
 * Which of these strings are not an ingredient in the catalog right now.
 *
 * Strings in, not `Id<"ingredients">`, for the reason `missingRecipeIds` gives: the caller is the
 * assistant's showSubstitutions tool, handing back ids a model copied, and a malformed one must be
 * named back to it rather than fail the whole call with an argument error. The catalog is reference
 * data, so existing is the whole check.
 */
export const missingIngredientIds = async (ctx: Pick<QueryCtx, "db">, { ids }: Args): Promise<string[]> => {
  const found = await Promise.all(
    ids.map(async (id) => {
      const ingredientId = ctx.db.normalizeId("ingredients", id);

      return ingredientId ? await ctx.db.get(ingredientId) : null;
    }),
  );

  return ids.filter((_, index) => !found[index]);
};
