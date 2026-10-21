import type { Doc, Id } from "@convex/_generated/dataModel";
import { withAliases } from "@convex/functions/ingredients/ingredientRow";
import { type ReplaceOutcome, replaceInRecipes } from "@convex/functions/ingredients/replaceInRecipes";
import type { MutationCtx } from "@convex/procedures";
import { LOCALES } from "@convex/schema/i18n";
import { type RecipeUnit, toGrams } from "@shared/ingredients";

type Args = {
  from: Id<"ingredients">;
  to: Id<"ingredients">;
};

export type MergeOutcome = ReplaceOutcome & {
  cellarItemsMoved: number;
  groceryListItemsMoved: number;
  plannedMealIngredientsMoved: number;
  recentlyUsedMoved: number;
  /** A household already had `to` among its recent ones: the shortcut on `from` went instead. */
  recentlyUsedDropped: number;
  /** `from`'s names and aliases `to` did not already hold, now aliases of `to`. */
  aliasesCarried: number;
};

/**
 * Folds one catalog row into another: everything that points at `from` points at `to`, and `from`
 * is deleted. For the row a recipe or a shopper invented before the seed held the same food — the
 * "piment rouge" created by an import, once `chili-red` is seeded. Run by hand, one pair at a time.
 *
 * Unlike `replaceInRecipes`, which moves the lines someone checked and nothing else, this moves
 * every reference: the recipe lines (through `replaceInRecipes`, which refreshes their recipes and
 * deletes `from`), and the household's cellar, grocery list, planned meals and recent shortcuts.
 * Rows are repointed in place, so their ids hold — the claim a planned line keeps on a grocery or
 * cellar row by id still finds it.
 *
 * `from`'s names and aliases become aliases of `to`, which is where this parts with
 * `replaceInRecipes`: a wrong link is not a synonym, but a duplicate is — "toasted sesame" found the
 * old row, and dropping it would let the next import that writes it invent the duplicate again.
 * A locale already full keeps its words and refuses the rest, as `withAlias` does for a learned one.
 *
 * **A quantity `to` cannot weigh refuses the whole call.** A line in `ml` on a `from` that knew its
 * density, moved onto a `to` that does not, would drop out of every total without a word. Better
 * to stop, and give `to` the weight or leave the pair alone.
 *
 * @limitation A household holding both rows keeps two cellar or grocery rows for one food after
 * the merge. Every reader collects a household's rows for an ingredient rather than taking the
 * first, as it must for one food held in two units, so nothing breaks — the two are just not added
 * together. Recent shortcuts are the exception, being one per food: the one on `from` is dropped.
 */
export const mergeIngredient = async (ctx: MutationCtx, { from, to }: Args): Promise<MergeOutcome> => {
  if (from === to) throw new Error("mergeIngredient: `from` and `to` are the same ingredient.");

  const [source, target] = await Promise.all([ctx.db.get(from), ctx.db.get(to)]);
  if (!source) throw new Error(`mergeIngredient: ingredient ${from} does not exist.`);
  if (!target) throw new Error(`mergeIngredient: ingredient ${to} does not exist.`);

  const [cellar, grocery, recent, planned, lines] = await Promise.all([
    ctx.db.query("cellarItems").withIndex("by_ingredient", (q) => q.eq("ingredientId", from)).collect(),
    ctx.db.query("groceryListItems").withIndex("by_ingredient", (q) => q.eq("ingredientId", from)).collect(),
    ctx.db.query("recentlyUsedIngredients").withIndex("by_ingredient", (q) => q.eq("ingredientId", from)).collect(),
    ctx.db.query("plannedMealIngredients").withIndex("by_ingredient", (q) => q.eq("ingredientId", from)).collect(),
    ctx.db.query("recipeIngredients").withIndex("by_ingredient", (q) => q.eq("ingredientId", from)).collect(),
  ]);

  const units = new Set<RecipeUnit>([
    ...[...cellar, ...grocery, ...recent, ...lines].map((row) => row.unit),
    ...planned.flatMap((row) => [row.unit, row.sourceUnit]),
  ]);
  const unweighable = [...units].filter((unit) => toGrams(1, unit, source) !== undefined && toGrams(1, unit, target) === undefined);
  if (unweighable.length > 0) {
    throw new Error(`mergeIngredient: ${to} cannot weigh ${unweighable.join(", ")}, which ${from} could.`);
  }

  const now = Date.now();
  const repoint = (id: Id<"cellarItems" | "groceryListItems" | "recentlyUsedIngredients" | "plannedMealIngredients">) =>
    ctx.db.patch(id, { ingredientId: to, updatedAt: now });

  await Promise.all([...cellar, ...grocery, ...planned].map((row) => repoint(row._id)));

  let recentlyUsedDropped = 0;
  for (const row of recent) {
    const already = await ctx.db
      .query("recentlyUsedIngredients")
      .withIndex("by_household_id_and_ingredient_id", (q) => q.eq("householdId", row.householdId).eq("ingredientId", to))
      .first();
    if (already) {
      await ctx.db.delete(row._id);
      recentlyUsedDropped++;
    } else {
      await repoint(row._id);
    }
  }

  const aliasesCarried = await carryAliases(ctx, source, target);

  const replaced = await replaceInRecipes(ctx, { from, to, lineIds: lines.map((line) => line._id) });

  return {
    ...replaced,
    cellarItemsMoved: cellar.length,
    groceryListItemsMoved: grocery.length,
    plannedMealIngredientsMoved: planned.length,
    recentlyUsedMoved: recent.length - recentlyUsedDropped,
    recentlyUsedDropped,
    aliasesCarried,
  };
};

/** Hands `target` every word `source` is found by — its names and its aliases, per locale. */
const carryAliases = async (ctx: MutationCtx, source: Doc<"ingredients">, target: Doc<"ingredients">) => {
  const words = Object.fromEntries(
    LOCALES.map((locale) => [locale, [source.name.values[locale], ...(source.aliases?.[locale] ?? [])].filter((word) => word !== undefined)]),
  );
  const grown = withAliases(target, words);
  if (!grown) return 0;

  await ctx.db.patch(target._id, { ...grown, updatedAt: Date.now() });

  return LOCALES.reduce((sum, locale) => sum + (grown.aliases?.[locale]?.length ?? 0) - (target.aliases?.[locale]?.length ?? 0), 0);
};
