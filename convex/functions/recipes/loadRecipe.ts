import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { getImage } from "@convex/functions/media/getImage";
import { type InstructionGroup, parseInstructions } from "@shared/recipes";
import { toGrams, type Unit } from "@shared/ingredients";
import { type RecipeNutrition, totalsOf } from "@shared/nutrition";
import type { Category } from "@shared/categories";

import { coverOf, type RecipeCard, toRecipeCard } from "./recipeCard";

type LoadCtx = Pick<QueryCtx, "db">;

/** A line of the recipe: how much of what, already named in the caller's language. */
type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: Unit;
  /** Stands in for the produce photo when `imageUrl` is absent, which is most of the catalog today. */
  emoji: string;
  /**
   * The produce photo the tile draws, when the catalog row has one — the thumbnail, and only it.
   *
   * Flattened to a URL here rather than sent as the whole image document, which is what the
   * catalog does (`CatalogIngredient.image`). The difference is who the shape is for: a catalog
   * row is handed to callers this function knows nothing about, so it ships every size and lets
   * them choose. A recipe line is only ever drawn as one 48pt tile, and a recipe reaching twenty
   * ingredients would otherwise carry twenty image documents of five sizes each to render twenty
   * thumbnails — for the same reason `RecipeCard` stops the document travelling.
   *
   * Absent covers all three of "no photo yet", "the image row is gone" and "written before images
   * existed"; the tile falls back to `emoji`, which is never absent.
   */
  imageUrl?: string;
  /**
   * Which aisle the line belongs to — sent as the stored key, not as a heading.
   *
   * The screen groups by it, and the order the aisles are drawn in is a display decision: a cook
   * reads vegetables before the store cupboard because that is how a kitchen is laid out, not
   * because of anything this function knows.
   */
  category: Category;
};

/** Who wrote the recipe, for the line that credits them. Absent on a recipe with no owner. */
type RecipeChef = {
  name: string;
};

/**
 * One recipe, in full, for the page that draws it.
 *
 * Built on `RecipeCard` rather than beside it, so the fields a list needs are described once.
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
  /**
   * The three timings as they were written, beside the `minutes` the card already sums them into.
   *
   * Both, because they answer different questions: a grid has room for one number and a recipe
   * page shows the breakdown, and summing on the client would mean two places that know a total is
   * preparation plus cooking plus resting.
   */
  timings: Doc<"recipes">["timings"];
  chef?: RecipeChef;
  /**
   * The cover at its large size, for the header that spans the screen, beside the card's medium
   * `coverImageUrl`. Two fields rather than one, so a name never means a different file depending
   * on which payload it arrived in. Absent in the same cases as the card's.
   */
  coverImageLargeUrl?: string;
  /**
   * What the recipe adds up to, or nothing at all.
   *
   * Computed per read rather than stored: it is a reduce over the same catalog rows the lines were
   * just named from, and a column would have to be rewritten every time an ingredient's macros are
   * corrected. `totalsOf` refuses a partial total, and so does this — see `_nutritionOf`.
   */
  nutrition?: RecipeNutrition;
};

/**
 * A line the page can draw, beside the catalog row it was drawn from.
 *
 * The row is kept rather than re-read because the nutrition total needs the very same documents:
 * fetching them twice for one page would double the reads to arrive at the same numbers.
 */
type ResolvedLine = {
  line: RecipeIngredient;
  ingredient: Doc<"ingredients">;
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
 *
 * `lineCount` is what the recipe HAS; `lines` is what resolved. The caller needs both, because a
 * total computed over the difference would be a total missing an ingredient.
 */
const _linesOf = async (
  ctx: LoadCtx,
  recipeId: Doc<"recipes">["_id"],
  locale: Locale,
): Promise<{ lines: ResolvedLine[]; lineCount: number }> => {
  const rows = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const resolved = await Promise.all(
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

        /** Skipped entirely for a row with no photo, which is most of the catalog today. */
        const image = ingredient.imageId ? await getImage(ctx, ingredient.imageId) : null;

        return {
          ingredient,
          line: {
            name: resolvei18n(ingredient.name, locale),
            quantity: row.quantity,
            unit: row.unit,
            emoji: ingredient.emoji,
            imageUrl: image?.sizes.thumbnail.url,
            category: ingredient.category,
          },
        };
      }),
  );

  return { lines: resolved.filter((line) => line !== null), lineCount: rows.length };
};

/**
 * The categories the Nutri-Score rewards a dish for containing.
 *
 * The classification lives here rather than in @shared/nutrition, which deliberately takes a
 * boolean: what counts as produce for a food score is a rule about this app's catalog, not a
 * property of arithmetic. Herbs and spices are out — they are produce in a greengrocer's sense and
 * weigh a gram in a dish, so counting them would move the score without moving the meal.
 */
const PRODUCE_CATEGORIES: readonly Category[] = ["VEGETABLE", "FRUIT", "LEGUME", "NUT"];

/**
 * What the recipe adds up to, or nothing.
 *
 * Refuses in three cases, all of them the same refusal `computeTags` makes and for the same
 * reason: a recipe with no lines, a recipe whose lines did not all resolve, and — inside
 * `totalsOf` — a recipe with a line that cannot reach grams. A dish quietly missing its olive oil
 * reads as a health food, and nothing downstream could tell a partial total from a real one.
 */
const _nutritionOf = (
  lines: ResolvedLine[],
  lineCount: number,
  servings: number,
): RecipeNutrition | undefined => {
  if (lineCount === 0 || lines.length !== lineCount) return undefined;

  return totalsOf(
    lines.map(({ line, ingredient }) => ({
      facts: ingredient.nutrition,
      grams: toGrams(line.quantity, line.unit, ingredient),
      produce: PRODUCE_CATEGORIES.includes(ingredient.category),
    })),
    servings,
  );
};

/**
 * Who to credit, from the recipe's owner.
 *
 * Absent rather than a placeholder name in both of the cases that reach it: a recipe with no
 * `userId` — a seeded one — and a user row carrying no name. The screen decides what an uncredited
 * recipe looks like; inventing "Anonymous" here would put one language into the payload and take
 * that decision away from it.
 */
const _chefOf = async (ctx: LoadCtx, userId?: Id<"users">): Promise<RecipeChef | undefined> => {
  if (!userId) return undefined;

  const user = await ctx.db.get(userId);

  return user?.name ? { name: user.name } : undefined;
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

  const [{ lines, lineCount }, chef, cover] = await Promise.all([
    _linesOf(ctx, recipe._id, locale),
    _chefOf(ctx, recipe.userId),
    coverOf(ctx, recipe),
  ]);

  return {
    ...toRecipeCard(recipe, locale, cover, null),
    coverImageLargeUrl: cover?.sizes.large.url,
    description: resolvei18n(recipe.description, locale),
    instructions: parseInstructions(resolvei18n(recipe.instructions, locale)),
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    equipments: recipe.equipments,
    tags: recipe.tags,
    timings: recipe.timings,
    ingredients: lines.map(({ line }) => line),
    nutrition: _nutritionOf(lines, lineCount, recipe.servings),
    chef,
  };
};
