import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { type GramWeights, mergeRecipeLines } from "@shared/ingredients";

import type { RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  links: RecipeLink[];
  /**
   * How many lines the recipe HAS, as `deriveRecipeFields` reads it. Omitted by a caller that
   * derives no tags (the restore writes the exported ones); it then defaults to `links.length`.
   */
  lineCount?: number;
};

/**
 * A recipe's links with every food linked twice folded into one (`mergeRecipeLines`), and the line
 * count that goes with them.
 *
 * The two travel together because `computeTags` refuses every tag when `links.length` falls short
 * of `lineCount`: merging the harira's two cumin lines without taking one off its count would read
 * as a line that failed to resolve, and strip the recipe of its tags.
 *
 * Only the duplicated ingredients are read, since only their weights can change the answer.
 */
export const mergeDuplicateLinks = async (
  ctx: MutationCtx,
  { links, lineCount = links.length }: Args,
): Promise<{ links: RecipeLink[]; lineCount: number }> => {
  const seen = new Set<Id<"ingredients">>();
  const duplicated = new Set<Id<"ingredients">>();
  for (const { ingredientId } of links) (seen.has(ingredientId) ? duplicated : seen).add(ingredientId);

  if (duplicated.size === 0) return { links, lineCount };

  const rows = await Promise.all([...duplicated].map((ingredientId) => ctx.db.get(ingredientId)));
  const weights = new Map<Id<"ingredients">, GramWeights>();
  for (const row of rows) if (row) weights.set(row._id, row);

  const merged = mergeRecipeLines(links, (ingredientId) => weights.get(ingredientId) ?? {});

  return { links: merged.lines, lineCount: lineCount - merged.absorbed };
};
