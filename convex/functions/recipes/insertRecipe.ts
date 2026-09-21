import type { Doc, Id } from "@convex/_generated/dataModel";
import { randomShuffleKey } from "@convex/lib/nanoid";
import type { MutationCtx } from "@convex/procedures";
import { facetsOf } from "@shared/tags";
import { canonicalUrlOf } from "@shared/urls";

import { recipeSearchText } from "./recipeSearchText";
import type { RecipeLink } from "./resolveRecipeIngredients";

/**
 * The columns this module derives, and no writer states: `search` from the links, the six facets
 * from `tags`, and the two the row gets on the way in.
 */
const DERIVED_FIELDS = [
  "search",
  "shuffleKey",
  "updatedAt",
  "isVegan",
  "isVegetarian",
  "isPescatarian",
  "isGlutenFree",
  "isDairyFree",
  "isNutFree",
] as const;

type DerivedField = (typeof DERIVED_FIELDS)[number];

/** What a writer states about a recipe: every column but the ones this module derives. */
export type RecipeFacts = Omit<Doc<"recipes">, "_id" | "_creationTime" | DerivedField>;

/**
 * A row's facts, its derived columns stripped — for a writer handed a whole row, as the restore is,
 * so that what it states is exactly what the other deployment stated and nothing this module
 * would then overwrite.
 */
export const recipeFactsOf = (row: Omit<Doc<"recipes">, "_id" | "_creationTime">): RecipeFacts => {
  const facts: Partial<Doc<"recipes">> = { ...row };
  for (const field of DERIVED_FIELDS) delete facts[field];

  return facts as RecipeFacts;
};

type Args = {
  recipe: RecipeFacts;
  /** The catalog rows the recipe's lines resolved to, each carrying the position of its line. */
  links: RecipeLink[];
  /**
   * The spelling of the lines, for `search`. A writer that knows every line's name may hand them
   * all over; the ones no link stands for are the ones that matter — see `recipeSearchText`.
   */
  names: string[];
};

/**
 * The one insert of a `recipes` row, and the `recipeIngredients` rows that belong to it.
 *
 * Two paths create a recipe: `saveRecipe`, from a generation, and `restoreRecipe`, from another
 * deployment's export. What they have in common is everything the table derives, and it is
 * derived HERE so that it is derived once (ADR 0011, C11): `search` by the field's one serializer,
 * the six facets from `tags` so a facet cannot disagree with its tag (ADR 0015), and `shuffleKey`,
 * fresh, because it only orders a sample. A writer states facts; this turns them into a row.
 *
 * `sourceUrl` is stored in the ONE spelling `canonicalUrlOf` produces, whatever the writer passed,
 * because the catalog's duplicate guard (`findCatalogBySource`) looks it up in that spelling: a
 * row stored in another would never be found, and every later import of the page would duplicate it.
 *
 * Each link already carries the `position` of the line it came from, so a recipe listing the same
 * ingredient twice is two rows — which re-deriving the position from this list would not be.
 */
export const insertRecipe = async (
  ctx: MutationCtx,
  { recipe, links, names }: Args,
): Promise<Id<"recipes">> => {
  // ADR 0011: the serializer is called HERE, where `search` is assigned, so C11 can verify this
  // writer on its own rather than trust a bundle it cannot see into.
  const search = await recipeSearchText(ctx, {
    ingredientIds: links.map((link) => link.ingredientId),
    names,
  });

  const recipeId = await ctx.db.insert("recipes", {
    ...recipe,
    sourceUrl: recipe.sourceUrl === undefined ? undefined : canonicalUrlOf(recipe.sourceUrl),
    ...facetsOf(recipe.tags),
    search,
    shuffleKey: randomShuffleKey(),
    updatedAt: Date.now(),
  });

  await Promise.all(
    links.map((link) => ctx.db.insert("recipeIngredients", { recipeId, ...link, updatedAt: Date.now() })),
  );

  return recipeId;
};
