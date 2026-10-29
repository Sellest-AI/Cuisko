import type { Doc, Id } from "@convex/_generated/dataModel";
import { randomShuffleKey } from "@convex/lib/nanoid";
import type { MutationCtx } from "@convex/procedures";
import { facetsOf } from "@shared/tags";
import { canonicalUrlOf } from "@shared/urls";

import { type RecipeText, writeRecipeContent } from "./recipeContent";
import { recipeSearchText } from "./recipeSearchText";
import { keepCookingFatUses } from "./keepCookingFatUses";
import type { RecipeLink } from "./resolveRecipeIngredients";

/**
 * The columns this module derives, and no writer states: `search` from the links, the six facets
 * from `tags`, and the three the row gets on the way in. `isArchived` is one of them because no
 * recipe is born deleted, restored ones included.
 */
const DERIVED_FIELDS = [
  "search",
  "shuffleKey",
  "updatedAt",
  "isArchived",
  "isVegan",
  "isVegetarian",
  "isPescatarian",
  "isGlutenFree",
  "isDairyFree",
  "isNutFree",
] as const;

type DerivedField = (typeof DERIVED_FIELDS)[number];

/**
 * What a writer states about a recipe: every `recipes` column but the ones this module derives, and
 * its text, which is stored in `recipeContents` rather than on the row.
 *
 * The text travels with the facts because every writer states both at once, and a recipe without
 * its text is not one any writer means to create. `splitRecipeText` is where they part.
 */
export type RecipeFacts = Omit<Doc<"recipes">, "_id" | "_creationTime" | DerivedField | keyof RecipeText> &
  RecipeText;

/**
 * The facts of a whole row handed over from elsewhere, as the restore's portable row is, with its
 * derived columns stripped so that what it states is exactly what the other deployment stated and
 * nothing this module would then overwrite. The derived columns may be missing, since they are
 * dropped either way.
 */
export const recipeFactsOf = (
  row: RecipeFacts & Partial<Pick<Doc<"recipes">, DerivedField>>,
): RecipeFacts => {
  const facts: Partial<RecipeFacts & Pick<Doc<"recipes">, DerivedField>> = { ...row };
  for (const field of DERIVED_FIELDS) delete facts[field];

  return facts as RecipeFacts;
};

/**
 * The facts as the two whole-row writers store them: the `recipes` columns, and the text apart.
 *
 * The one place the text comes off the facts, for `insertRecipe` and the restore's replace in
 * place alike. A writer spreading the facts straight onto the row would put the text back on a
 * migrated recipe, where `moveRecipeContent` (already recorded as done) would never take it off.
 */
export const splitRecipeText = ({ description, instructions, ...row }: RecipeFacts) => ({
  row,
  text: { description, instructions } satisfies RecipeText,
});

/**
 * The columns a recipe's facts and links derive, for every writer of a whole row: `insertRecipe`,
 * and the restore's replace in place. `search` by the field's one serializer (ADR 0011), the six
 * facets from `tags` (ADR 0015), and `updatedAt`. `shuffleKey` and `isArchived` are left to the
 * writer, because a replace keeps the row's own key.
 */
export const derivedRecipeColumns = async (
  ctx: MutationCtx,
  { tags, links, names }: { tags: RecipeFacts["tags"]; links: RecipeLink[]; names: string[] },
) => ({
  ...facetsOf(tags),
  // ADR 0011: the serializer is called HERE, where `search` is assigned, so C11 can verify this
  // writer on its own rather than trust a bundle it cannot see into.
  search: await recipeSearchText(ctx, { ingredientIds: links.map((link) => link.ingredientId), names }),
  updatedAt: Date.now(),
});

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
 * The one insert of a `recipes` row, and the `recipeContents` and `recipeIngredients` rows that
 * belong to it.
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
  { recipe, links: tagged, names }: Args,
): Promise<Id<"recipes">> => {
  const links = await keepCookingFatUses(ctx, tagged);
  const { row, text } = splitRecipeText(recipe);

  const recipeId = await ctx.db.insert("recipes", {
    ...row,
    sourceUrl: row.sourceUrl === undefined ? undefined : canonicalUrlOf(row.sourceUrl),
    ...(await derivedRecipeColumns(ctx, { tags: row.tags, links, names })),
    shuffleKey: randomShuffleKey(),
    isArchived: false,
  });

  await writeRecipeContent(ctx, recipeId, text);

  await Promise.all(
    links.map((link) => ctx.db.insert("recipeIngredients", { recipeId, ...link, updatedAt: Date.now() })),
  );

  return recipeId;
};
