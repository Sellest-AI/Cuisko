import type { QueryCtx } from "@convex/procedures";

type Args = {
  /** Strings that are meant to be recipe ids, and may not be. */
  ids: string[];
};

/**
 * Which of these strings are not a recipe that exists right now.
 *
 * **Strings in, not `Id<"recipes">`, because the caller is a model.** The assistant carries ids a
 * search handed it and passes them to its display tool (ADR 0010), and a model copying a
 * 32-character string can change one character or recall one from an earlier turn. Typing the
 * argument as an id would make Convex reject the whole call on the first malformed one, with an
 * argument error that names no id — the model could not tell which to drop. Here a malformed id, an
 * id of another table and a deleted recipe all get the same answer: they are listed back.
 *
 * Readable is the same as existing for a recipe: any signed-in cook may read any recipe (ADR 0014),
 * so there is no ownership question to add.
 */
export const missingRecipeIds = async (ctx: Pick<QueryCtx, "db">, { ids }: Args): Promise<string[]> => {
  const found = await Promise.all(
    ids.map(async (id) => {
      const recipeId = ctx.db.normalizeId("recipes", id);

      return recipeId ? await ctx.db.get(recipeId) : null;
    }),
  );

  return ids.filter((_, index) => !found[index]);
};
