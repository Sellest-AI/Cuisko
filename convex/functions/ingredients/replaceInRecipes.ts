import type { Id, TableNames } from "@convex/_generated/dataModel";
import { cascadeDelete, referencedBy } from "@convex/functions/cascade";
import { refreshRecipe } from "@convex/functions/recipes/refreshRecipe";
import type { MutationCtx } from "@convex/procedures";

type Args = {
  from: Id<"ingredients">;
  to: Id<"ingredients">;
  /**
   * Lines, not recipes: one recipe can hold the same row on two lines that mean different things —
   * the Grilled Mackerel's `4 pcs` black pepper is really its bell peppers, its `0.625 tsp` is
   * pepper — and only the first should move.
   */
  lineIds: Id<"recipeIngredients">[];
};

export type ReplaceOutcome = {
  linesMoved: number;
  /** Recipes whose tags or search were actually rewritten; one already current is not counted. */
  recipesRefreshed: number;
  /**
   * Recipes left untouched because a line was dropped at import — their tags and search still
   * describe the old ingredient, and need checking by hand.
   */
  recipesSkipped: Id<"recipes">[];
  /**
   * Recipes where a moved line landed on a food they already held, and the refresh folded the two
   * into one line: the recipe now has one line fewer than before the call.
   */
  recipesWithMergedLines: Id<"recipes">[];
  deleted: boolean;
  /** Why `from` was kept: a seeded row, or the tables still pointing at it. Empty when deleted. */
  keptBecause: ("seed" | TableNames)[];
};

/**
 * Repoints recipe lines linked to the wrong catalog row, for the one who checked them against their
 * source — run from the dashboard. Only `ingredientId` changes: a line's position, quantity and
 * unit are the recipe's, and they were right.
 *
 * **One wrong line refuses the whole call.** A line that is not on `from` is a line the caller
 * misread, and moving the others anyway would apply half a correction nobody checked.
 *
 * Each recipe touched is then refreshed (`refreshRecipe`), since its tags and search were derived
 * from the row it no longer uses.
 *
 * `from` is deleted once nothing points at it any more — any table in `CASCADE.ingredients`, not
 * only recipe lines — unless it is a seeded row, which the catalog would only write back. A row
 * with no `source` predates the column and is kept too: nothing proves it was not seeded.
 */
export const replaceInRecipes = async (
  ctx: MutationCtx,
  { from, to, lineIds }: Args,
): Promise<ReplaceOutcome> => {
  if (from === to) throw new Error("replaceInRecipes: `from` and `to` are the same ingredient.");

  const [source, target] = await Promise.all([ctx.db.get(from), ctx.db.get(to)]);
  if (!source) throw new Error(`replaceInRecipes: ingredient ${from} does not exist.`);
  if (!target) throw new Error(`replaceInRecipes: ingredient ${to} does not exist.`);

  const ids = [...new Set(lineIds)];
  const lines = await Promise.all(ids.map((id) => ctx.db.get(id)));

  lines.forEach((line, index) => {
    if (!line) throw new Error(`replaceInRecipes: line ${ids[index]} does not exist.`);
    if (line.ingredientId !== from) {
      throw new Error(`replaceInRecipes: line ${ids[index]} is on ${line.ingredientId}, not on ${from}.`);
    }
  });

  await Promise.all(ids.map((id) => ctx.db.patch(id, { ingredientId: to, updatedAt: Date.now() })));

  const recipeIds = [...new Set(lines.map((line) => line!.recipeId))];
  let recipesRefreshed = 0;
  const recipesSkipped: Id<"recipes">[] = [];
  const recipesWithMergedLines: Id<"recipes">[] = [];

  for (const recipeId of recipeIds) {
    const { refreshed, merged, whole } = await refreshRecipe(ctx, recipeId);
    if (refreshed) recipesRefreshed++;
    if (merged) recipesWithMergedLines.push(recipeId);
    if (!whole) recipesSkipped.push(recipeId);
  }

  const keptBecause: ReplaceOutcome["keptBecause"] = [
    ...(source.source === undefined || source.source === "seed" ? (["seed"] as const) : []),
    ...(await referencedBy(ctx, "ingredients", from)),
  ];

  // Neither ingredient row is edited: this replaces ids and nothing else. `from`'s name and aliases
  // are NOT carried onto `to`, because a wrong link is not a synonym — replacing tomato with ketchup
  // must not make "tomato" find ketchup. If that is ever needed, it is its own function.
  if (keptBecause.length === 0) await cascadeDelete(ctx, "ingredients", from);

  return {
    linesMoved: ids.length,
    recipesRefreshed,
    recipesSkipped,
    recipesWithMergedLines,
    deleted: keptBecause.length === 0,
    keptBecause,
  };
};
