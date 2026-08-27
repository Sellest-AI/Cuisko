import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { type InstructionGroup, parseInstructions } from "@shared/recipes";
import type { Unit } from "@shared/ingredients";

import { type RecipeCard, toRecipeCard } from "./recipeCard";

type LoadCtx = Pick<QueryCtx, "db">;

/** A line of the recipe: how much of what, already named in the caller's language. */
type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: Unit;
};

/**
 * One recipe, in full, for the page that draws it.
 *
 * Built on `RecipeCard` rather than beside it, so the four fields a list needs are described once.
 * A card is a detail with most of it left out, and stating that as an intersection means the two
 * cannot disagree about what a title or a cuisine is.
 *
 * The vocabularies (`difficulty`, `equipments`, `tags`, `cuisine`) stay as stored — keys, not
 * words. They are locale-free by design and the screen owns the translation table; resolving them
 * here would put one language into fields whose whole point is that they hold none.
 */
export type RecipeDetail = RecipeCard & {
  description: string;
  instructions: InstructionGroup[];
  servings: number;
  difficulty: Doc<"recipes">["difficulty"];
  equipments: Doc<"recipes">["equipments"];
  tags: Doc<"recipes">["tags"];
  ingredients: RecipeIngredient[];
};

/**
 * The recipe's lines, in the order they are written, each named in the caller's locale.
 *
 * Ordered by `position` rather than by insertion: the join table carries it precisely because the
 * order of a recipe's ingredients is meaningful, and `by_recipe` orders by creation time, which is
 * only the same thing until a line is edited.
 *
 * The catalog rows are fetched concurrently. It is an N+1 in shape, but bounded by the length of
 * one recipe rather than by the size of a table, and a recipe with forty ingredients does not
 * exist — so the fix for it would be a denormalized name that has to be kept in step with the
 * catalog, which is a worse trade at this size.
 */
const _linesOf = async (
  ctx: LoadCtx,
  recipeId: Doc<"recipes">["_id"],
  locale: Locale,
): Promise<RecipeIngredient[]> => {
  const rows = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const lines = await Promise.all(
    [...rows]
      .sort((a, b) => a.position - b.position)
      .map(async (row) => {
        const ingredient = await ctx.db.get(row.ingredientId);

        /**
         * A line whose catalog row is gone cannot be named, and a quantity with no name is worse
         * on the page than one line fewer. The cascade should make this unreachable; it is dropped
         * rather than asserted because a recipe page is not the place to find out.
         */
        if (!ingredient) return null;

        return {
          name: resolvei18n(ingredient.name, locale),
          quantity: row.quantity,
          unit: row.unit,
        };
      }),
  );

  return lines.filter((line) => line !== null);
};

/**
 * The recipe itself, or where to find it.
 *
 * `ownedQueryI18n` has already loaded the row to prove the caller owns it, so passing the document
 * spares a second read of a row that is already in hand. A caller holding only an id — an internal
 * action, a scheduled job — hands over the id and this fetches it.
 *
 * ⚠️ **Neither branch is an authorization check**, and the id branch is the one that can look like
 * one. Ownership is the router builder's (`ownedQuery*`), never this function's: `loadRecipe` will
 * happily resolve any recipe in the table for anybody who asks.
 */
type RecipeOrId = Doc<"recipes"> | Id<"recipes">;

/** Convex ids are branded strings, so the discriminant is the primitive type and nothing else. */
const _resolve = async (ctx: LoadCtx, target: RecipeOrId): Promise<Doc<"recipes">> => {
  if (typeof target !== "string") return target;

  const recipe = await ctx.db.get(target);
  if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "Recipe not found" });

  return recipe;
};

/**
 * One recipe, resolved into the language the caller is reading in.
 *
 * `instructions` arrives parsed rather than as the stored blob. The parser is `@shared/recipes`, so
 * either side could run it — doing it here means it runs once per fetch instead of once per render,
 * and the two screens that consume this both need the groups rather than the text.
 */
export const loadRecipe = async (
  ctx: LoadCtx,
  { recipe: target, locale }: { recipe: RecipeOrId; locale: Locale },
): Promise<RecipeDetail> => {
  const recipe = await _resolve(ctx, target);

  return {
    ...toRecipeCard(recipe, locale),
    description: resolvei18n(recipe.description, locale),
    instructions: parseInstructions(resolvei18n(recipe.instructions, locale)),
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    equipments: recipe.equipments,
    tags: recipe.tags,
    ingredients: await _linesOf(ctx, recipe._id, locale),
  };
};
