import type { Id } from "@convex/_generated/dataModel";
import { hashText, setTranslation } from "@convex/lib/i18n";
import type { Localized, TranslationStatus } from "@convex/schema/i18n";
import type { MutationCtx } from "@convex/procedures";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { Locale } from "@shared/translations";
import type { Unit } from "@shared/ingredients";
import { serializeInstructions } from "@shared/recipes";

import { deriveRecipeFields } from "./deriveRecipeFields";
import { recipeSearchText } from "./recipeSearchText";
import type { MatchedIngredient } from "../ingredients/matchIngredients";

type Args = {
  recipeId: Id<"recipes">;
  /** The language the cook edited in — the only field this run has fresh text for. */
  locale: Locale;
  recipe: SanitizedRecipe;
  /**
   * Whether `recipe` passed through the agent, or is the cook's own text carried straight through
   * unmodified — `updateOne` knows which, because it is the one that decided not to call it.
   * Decides `"machine"` versus `"edited"` below: text nobody analyzed is not machine-authored just
   * because it landed here through the same code path.
   */
  analyzed: boolean;
};

/** One `recipeIngredients` row's own shape, stripped of everything that isn't the link itself. */
type LinkedIngredient = { ingredientId: Id<"ingredients">; position: number; quantity: number; unit: Unit };

const _linkOf = (matches: MatchedIngredient[], recipe: SanitizedRecipe): LinkedIngredient[] =>
  recipe.ingredients
    .map((line, index): LinkedIngredient | undefined => {
      const match = matches[index];
      if (match?.status !== "matched") return undefined;

      return { ingredientId: match.ingredientId, position: index, quantity: line.quantity, unit: line.unit };
    })
    .filter((link): link is LinkedIngredient => link !== undefined);

/**
 * Whether two link sets name the same ingredients, in the same amounts, in the same order.
 *
 * Both sides are sorted by `position` first: the old rows come back from an index in whatever order
 * Convex happens to store them, and a set that is genuinely unchanged must not be reported as
 * different because it was compared in the wrong order.
 */
const _sameLinks = (a: LinkedIngredient[], b: LinkedIngredient[]): boolean => {
  if (a.length !== b.length) return false;

  const sort = (links: LinkedIngredient[]) => [...links].sort((x, y) => x.position - y.position);
  const [left, right] = [sort(a), sort(b)];

  return left.every((link, index) => {
    const other = right[index]!;
    return (
      link.ingredientId === other.ingredientId &&
      link.position === other.position &&
      link.quantity === other.quantity &&
      link.unit === other.unit
    );
  });
};

/**
 * A re-sanitized recipe patched onto the row it came from, rather than a new one.
 *
 * `saveRecipe`'s insert with the identity swapped for a patch, and that is the whole of the
 * difference: the model was handed the row's own content as `outdated` context, so `recipe` here
 * is a revision of it, not a fresh generation, and `deriveRecipeFields` recomputes exactly the same
 * three things a create does — nothing here may special-case an edit's derived fields, or the two
 * paths could disagree about what a recipe's own tags are.
 */
export const updateRecipe = async (ctx: MutationCtx, { recipeId, locale, recipe, analyzed }: Args) => {
  const existing = await ctx.db.get(recipeId);
  if (!existing) throw new Error(`updateRecipe: recipe ${recipeId} does not exist.`);

  const { matches, tags, facets } = await deriveRecipeFields(ctx, { locale, recipe });

  // ADR 0011: the serializer is called HERE, where `search` is assigned — see `saveRecipe`.
  const search = await recipeSearchText(ctx, {
    ingredientIds: matches.flatMap((match) =>
      match.status === "matched" ? [match.ingredientId] : [],
    ),
    names: recipe.ingredients.map((line) => line.name),
  });

  /**
   * Folded onto the EXISTING field rather than built fresh, unlike `saveRecipe`'s `_machine`: a
   * recipe already translated into the cook's other language would otherwise lose that language
   * the moment it is edited in this one. `setTranslation` only ever touches the one locale it is
   * given.
   */
  const status: TranslationStatus = analyzed ? "machine" : "edited";
  const _rewrite = (field: Localized, value: string): Localized =>
    setTranslation(field, locale, value, status, hashText(value));

  await ctx.db.patch(recipeId, {
    title: _rewrite(existing.title, recipe.title),
    description: _rewrite(existing.description, recipe.description),
    instructions: _rewrite(existing.instructions, serializeInstructions(recipe.instructions)),
    servings: recipe.servings,
    equipments: recipe.equipments,
    difficulty: recipe.difficulty,
    tags,
    ...facets,
    search,
    cuisine: recipe.cuisine,
    timings: recipe.timings,
    updatedAt: Date.now(),
  });

  /**
   * Skipped entirely when the resolved links did not change — a title-only edit re-matches the
   * same names against the same catalog and would otherwise delete and reinsert every row for
   * nothing, and re-matching is not guaranteed to land on the same catalog row twice: a fuzzy match
   * sitting near its threshold could resolve differently between two runs for reasons that have
   * nothing to do with what the cook actually edited.
   */
  const old = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const nextLinks = _linkOf(matches, recipe);
  const oldLinks = old.map((row) => ({
    ingredientId: row.ingredientId,
    position: row.position,
    quantity: row.quantity,
    unit: row.unit,
  }));

  if (!_sameLinks(oldLinks, nextLinks)) {
    await Promise.all(old.map((row) => ctx.db.delete(row._id)));

    await Promise.all(
      nextLinks.map((link) =>
        ctx.db.insert("recipeIngredients", { recipeId, ...link, updatedAt: Date.now() }),
      ),
    );
  }

  return recipeId;
};
