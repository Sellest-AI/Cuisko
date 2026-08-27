import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { toGrams } from "@shared/ingredients";
import type { Unit } from "@shared/ingredients";
import { totalsOf } from "@shared/nutrition";
import { allergenTagsOf, type ComputedTag, dietTagsOf, nutritionTagsOf } from "@shared/tags";

/**
 * One recipe line, already matched to a catalog row.
 *
 * The id and not the document, because the caller that has these has just run `matchIngredients`
 * and holds ids — loading the rows is this file's job, and doing it here is what keeps the reads
 * batched instead of one per line at the call site.
 */
export type TaggableLine = {
  ingredientId: Id<"ingredients">;
  quantity: number;
  unit: Unit;
};

/**
 * The tags that are a function of the ingredient rows rather than of anyone's judgement.
 *
 * **All lines or nothing.** `lines` must be every ingredient the recipe has, including the ones
 * that did not match the catalog — and this returns `[]` the moment one is missing. Every tag here
 * is a claim of absence, and absence cannot be argued from a subset: `saveRecipe` deliberately
 * drops unmatched lines from `recipeIngredients`, so computing over that table instead would call
 * a recipe vegan on the strength of the four ingredients it happened to recognise.
 *
 * That rule then repeats once per group of tags, because the three groups rest on three different
 * facts and any of them can be missing on its own:
 *
 * - **diet** needs `ingredients.diet` on every row. It is not inferred from `category`, and this is
 *   the fix for the bug that made the tag untrustworthy: a category proves what an ingredient IS
 *   and is silent on what it is not, so fish sauce (`CONDIMENT`), honey (`SWEETENER`) and gelatin
 *   (`OTHER`) all read as plants and a pad thai came out vegetarian.
 * - **free-from** needs `ingredients.allergens` on every row. `undefined` there is "nobody has
 *   classified this ingredient", which is NOT the same as the `[]` of one classified and carrying
 *   none — and reading the first as the second is a confident `nut-free` on an unchecked recipe.
 * - **nutrition** needs every line to be weighable, which `totalsOf` decides.
 *
 * A recipe can therefore earn one group and not another, and that is correct: knowing a dish is
 * low-calorie says nothing about whether anyone has checked it for peanuts.
 */
export const computeTags = async (
  ctx: Pick<MutationCtx, "db">,
  { lines, lineCount, servings }: {
    /** The lines that resolved to a catalog row. */
    lines: TaggableLine[];
    /** How many lines the recipe HAS. More than `lines.length` means one did not resolve. */
    lineCount: number;
    servings: number;
  },
): Promise<ComputedTag[]> => {
  if (lineCount === 0 || lines.length !== lineCount) return [];

  const ingredients = await Promise.all(lines.map(({ ingredientId }) => ctx.db.get(ingredientId)));
  // A row deleted between the match and this read is an unknown ingredient, and an unknown
  // ingredient is not a vegetable.
  if (ingredients.some((ingredient) => ingredient === null)) return [];

  const rows = ingredients as Doc<"ingredients">[];

  const diets = rows.map((ingredient) => ingredient.diet);
  // `undefined` on any row and the whole recipe loses its diet tags. Nothing is salvageable from
  // the rest: the tags say what the dish does NOT contain, and one unclassified ingredient is
  // exactly the one that could contain it.
  const diet = diets.every((value) => value !== undefined) ? dietTagsOf(diets) : [];

  const allergens = rows.map((ingredient) => ingredient.allergens);
  // Same shape of refusal as `diet` above, and the same reason: one unclassified line is exactly
  // the line that could carry the thing the tag promises is absent.
  const freeFrom = allergens.every((value) => value !== undefined)
    ? allergenTagsOf(allergens.flat())
    : [];

  const totals = totalsOf(
    rows.map((ingredient, index) => ({
      facts: ingredient.nutrition,
      grams: toGrams(lines[index]!.quantity, lines[index]!.unit, ingredient),
      // Irrelevant to the tags — it only feeds the Nutri-Score, which this file does not read.
      produce: false,
    })),
    servings,
  );

  // `undefined` is a line that could not be weighed, not a recipe with no calories: it gets the
  // tags it earned elsewhere and no nutrition claim at all.
  const nutrition = totals ? nutritionTagsOf(totals.perServing) : [];

  return [...diet, ...freeFrom, ...nutrition];
};
