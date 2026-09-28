import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import type { RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  recipeId: Id<"recipes">;
  /** The recipe's `recipeIngredients` rows as they are stored now. */
  rows: Doc<"recipeIngredients">[];
  /** What they should become. */
  links: RecipeLink[];
};

type Row = Doc<"recipeIngredients">;

/**
 * How closely a row must resemble a link to be handed it, tightest first. Every pass is on the same
 * ingredient; the earlier ones also want the same unit, then the same amount.
 */
const _PASSES: ((row: Row, link: RecipeLink) => boolean)[] = [
  (row, link) => row.unit === link.unit && row.quantity === link.quantity,
  (row, link) => row.unit === link.unit,
  () => true,
];

/**
 * Brings a recipe's stored rows in line with a set of links, keeping every row that still has a
 * link to stand for.
 *
 * Each link is handed an unused row on the same ingredient, patched only where its position,
 * quantity or unit moved; a link with no such row is inserted, and a row no link took is deleted.
 * So a merge that folds two cumin lines into one deletes one row and patches the other, and the
 * lentils below them keep their id with only their position changed.
 *
 * The ids matter because a line is addressed by id from outside: `replaceInRecipes` is handed line
 * ids read off the dashboard, and a rewrite that reinserted every row would turn each of them into
 * "does not exist" for a line nobody touched.
 *
 * **Rows are handed out in passes, closest match first** (`_PASSES`), not to the first row on the
 * ingredient. Two lines of one food can stay apart when they cannot be summed, the Grilled
 * Mackerel's `4 pcs` black pepper (really its bell peppers) beside its `0.625 tsp`. Matching on the
 * ingredient alone let an edit that reordered them hand the `4 pcs` row to the teaspoon, and an
 * admin repointing that row by id would move the seasoning instead of the peppers.
 */
export const syncRecipeLinks = async (ctx: MutationCtx, { recipeId, rows, links }: Args) => {
  const unused = new Set(rows);
  const taken = new Map<RecipeLink, Row>();

  for (const matches of _PASSES) {
    for (const link of links) {
      if (taken.has(link)) continue;

      const row = [...unused].find((candidate) => candidate.ingredientId === link.ingredientId && matches(candidate, link));
      if (!row) continue;

      taken.set(link, row);
      unused.delete(row);
    }
  }

  const writes = links.map((link) => {
    const row = taken.get(link);
    if (!row) return ctx.db.insert("recipeIngredients", { recipeId, ...link, updatedAt: Date.now() });

    const moved = row.position !== link.position || row.quantity !== link.quantity || row.unit !== link.unit;

    return moved
      ? ctx.db.patch(row._id, { position: link.position, quantity: link.quantity, unit: link.unit, updatedAt: Date.now() })
      : Promise.resolve();
  });

  await Promise.all([...writes, ...[...unused].map((row) => ctx.db.delete(row._id))]);
};
