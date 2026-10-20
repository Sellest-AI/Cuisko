import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

export type UnreviewedCatalogRecipe = {
  recipeId: Id<"recipes">;
  /** The page `verifyOne` checks it against. */
  sourceUrl: string;
  /** For the script's log only: the first locale it has. */
  title: string;
};

/**
 * The catalog recipes nobody has verified yet: `catalog:verify`'s queue.
 *
 * `generated` only. An `edited` catalog recipe was changed by a person after a review, and a
 * verify would overwrite that person's correction with the page's text. Live and imported from a
 * page only, since a verify needs the page and an archived recipe is chosen from nowhere.
 *
 * @limitation Reads the whole live catalog and keeps the `generated` rows in memory: no index
 *   carries owner, `isArchived` and `status` together, and the catalog is a few hundred rows. A
 *   catalog in the thousands needs a `by_user_and_is_archived_and_status` index.
 */
export const listUnreviewedCatalog = async (ctx: QueryCtx): Promise<UnreviewedCatalogRecipe[]> => {
  const catalog = await ctx.db
    .query("recipes")
    .withIndex("by_user_and_is_archived", (q) => q.eq("userId", undefined).eq("isArchived", false))
    .collect();

  return catalog.flatMap((recipe) =>
    recipe.status === "generated" && recipe.sourceUrl
      ? [
        {
          recipeId: recipe._id,
          sourceUrl: recipe.sourceUrl,
          title: Object.values(recipe.title.values).find(Boolean) ?? "",
        },
      ]
      : [],
  );
};
