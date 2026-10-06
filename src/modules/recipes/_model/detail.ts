/**
 * How a fetched recipe is rearranged for the screens that draw it — scaled, grouped, flattened.
 *
 * Framework-free, and structural rather than typed against the payload: four screens read the same
 * recipe and have to agree about what a halved quantity is and what "step 3" means, so the rules
 * live here where they can be tested without mounting anything.
 */

import { CATEGORIES, type Category } from "@shared/categories";
import type { RecipeUnit } from "@shared/ingredients";
import type { InstructionGroup } from "@shared/recipes";
import { scaleQuantity } from "@shared/servings";

import type { Conversion } from "./units";

/**
 * One line of a recipe, as everything below reads it.
 *
 * Declared structurally rather than imported from the backend's `RecipeDetail`: `_model/` takes no
 * Convex import, and stating the three fields it actually uses means a field added to the payload
 * does not widen what these functions claim to handle.
 */
export type RecipeLine = {
  name: string;
  quantity: number;
  unit: RecipeUnit;
  emoji: string;
  imageUrl?: string;
  category: Category;
  /** What the tile converts the line through when a cook taps it for another unit. */
  conversion: Conversion;
};

/**
 * The lines rewritten for a different number of people, each by `scaleQuantity` — the rule the
 * assistant's brief scales by too, so the stove and the screen quote the same amount.
 *
 * Scaling to the servings the recipe was written for returns the lines untouched — the same array,
 * so the memo in `useRecipe` hands back the query's own objects at rest — which is what makes the
 * stepper's resting position identical to not having a stepper at all.
 */
export const scaleTo = (lines: RecipeLine[], written: number, wanted: number): RecipeLine[] => {
  if (written <= 0 || wanted === written) return lines;

  return lines.map((line) => ({ ...line, quantity: scaleQuantity(line.quantity, written, wanted) }));
};

/** One aisle of the list — the category, and the lines that belong to it in their written order. */
export type LineGroup = {
  category: Category;
  lines: RecipeLine[];
};

/**
 * The lines gathered into aisles, in the order a kitchen is laid out.
 *
 * The order is `CATEGORIES`' own, which runs produce → proteins → store cupboard: a cook reads
 * the fresh things first because those are the ones they have to look at. Sorting alphabetically
 * instead would put condiments above vegetables in English and the reverse in French, which is a
 * list that rearranges itself when the phone changes language.
 *
 * Within an aisle the written order survives — the backend already sorted by `position`, and that
 * order is meaningful — so this only ever moves lines between groups, never inside one. An empty
 * category is not emitted: a heading with nothing under it is a recipe claiming an ingredient.
 *
 * `minimum` is the smallest aisle worth drawing as one. A recipe reaches into a dozen categories
 * and takes one thing from most of them, so grouping honestly produces a page of headings with a
 * single tile under each — more labels than ingredients, and harder to read than no grouping at
 * all. Anything under the threshold falls into `OTHER`, which is last in the vocabulary, so the
 * odds and ends collect at the bottom where a cook already expects them.
 *
 * `OTHER` is exempt from its own threshold, and has to be: it is where the small groups go, so
 * measuring it would mean deciding whether to fold the fold-into destination into itself.
 *
 * The default of 1 folds nothing — every group that exists has at least one line — so a caller
 * that has not thought about it gets the plain grouping rather than a surprise.
 */
export const groupByCategory = (lines: RecipeLine[], minimum = 1): LineGroup[] => {
  const sizes = new Map<Category, number>();
  for (const line of lines) sizes.set(line.category, (sizes.get(line.category) ?? 0) + 1);

  const standsAlone = (category: Category) =>
    category === "OTHER" || (sizes.get(category) ?? 0) >= minimum;

  return CATEGORIES.map((category) => ({
    category,
    /**
     * Filtered out of the original array rather than concatenated from the folded groups, which is
     * what keeps `OTHER` in the recipe's written order instead of in category order.
     */
    lines: lines.filter((line) =>
      standsAlone(line.category) ? line.category === category : category === "OTHER",
    ),
  })).filter((group) => group.lines.length > 0);
};

/** One step of the method, numbered across the whole recipe rather than within its group. */
export type FlatStep = {
  /** The heading the step sits under, absent for an ungrouped run. */
  title?: string;
  instruction: string;
  /** The tips the cooking session draws under the step. The instructions tab leaves them out. */
  hints: string[];
  /** 1-based, because it is what a cook reads aloud. Never restarts at a group boundary. */
  position: number;
};

/**
 * The method as one unbroken run of steps.
 *
 * The instructions tab draws the groups and the cooking session walks the steps, and "step 3" has
 * to mean the same thing in both — someone reading the tab and someone at the hob are looking at
 * one recipe. So the numbering is computed once, here, rather than by each screen counting the
 * groups above it.
 */
export const flattenSteps = (groups: InstructionGroup[]): FlatStep[] =>
  groups
    .flatMap((group) =>
      group.steps.map(({ instruction, hints }) => ({
        ...(group.title !== undefined && { title: group.title }),
        instruction,
        hints,
      })),
    )
    .map((step, index) => ({ ...step, position: index + 1 }));
