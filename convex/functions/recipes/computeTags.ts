import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Category } from "@convex/schema/ingredients";
import { toGrams } from "@shared/ingredients";
import type { Unit } from "@shared/ingredients";
import { totalsOf } from "@shared/nutrition";
import { type ComputedTag, dietTagsOf, nutritionTagsOf } from "@shared/tags";

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
 * The categories that carry a diet fact, as three disjoint sets.
 *
 * A `Set` per claim rather than a switch, so adding a category to `CATEGORIES` without deciding
 * what it means for a diet leaves it in none of them — which reads as "not known to contain meat"
 * and is exactly the direction the gap in this file already runs. See the warning below.
 */
const MEAT: ReadonlySet<Category> = new Set<Category>(["MEAT"]);
const SEAFOOD: ReadonlySet<Category> = new Set<Category>(["SEAFOOD"]);
const FROM_ANIMAL: ReadonlySet<Category> = new Set<Category>(["DAIRY", "EGG"]);

const _dietLine = (ingredient: Doc<"ingredients">) => ({
  meat: MEAT.has(ingredient.category),
  seafood: SEAFOOD.has(ingredient.category),
  fromAnimal: FROM_ANIMAL.has(ingredient.category),
});

/**
 * The tags that are a function of the ingredient rows rather than of anyone's judgement.
 *
 * **All lines or nothing.** `lines` must be every ingredient the recipe has, including the ones
 * that did not match the catalog — and this returns `[]` the moment one is missing. Every tag here
 * is a claim of absence, and absence cannot be argued from a subset: `saveRecipe` deliberately
 * drops unmatched lines from `recipeIngredients`, so computing over that table instead would call
 * a recipe vegan on the strength of the four ingredients it happened to recognise.
 *
 * ⚠️ **The diet tags are only as sound as `category` is.** A category proves what an ingredient
 * IS — it cannot prove what it is not, and the catalog has no diet field to prove it with. Fish
 * sauce is a `CONDIMENT`, honey is a `SWEETENER`, gelatin is `OTHER`: none is caught here, and a
 * pad thai will be called vegetarian. Closing this means a per-row `diet` flag on the catalog,
 * the same shape of fix the allergen tags are waiting on, and until then these three are a
 * best-effort filter aid rather than a promise anyone should cook against.
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
  const diet = dietTagsOf(rows.map(_dietLine));

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
  // diet tags it earned and no nutrition claim at all.
  return totals ? [...diet, ...nutritionTagsOf(totals.perServing)] : diet;
};
