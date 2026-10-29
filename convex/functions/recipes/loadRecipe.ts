import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { getImage } from "@convex/functions/media/getImage";
import { ANONYMOUS_AVATAR_SEED, avatarSeed } from "@shared/avatars";
import { type InstructionGroup, parseInstructions } from "@shared/recipes";
import type { FatUse, GramWeights, RecipeUnit, Unit } from "@shared/ingredients";
import type { RecipeNutrition } from "@shared/nutrition";
import type { Category } from "@shared/categories";

import { coverOf, plateOf, type RecipeCard, toRecipeCard } from "./recipeCard";
import { loadRecipeContent } from "./recipeContent";
import { loadRecipeLines, nutritionOfLines, withCuiScore, type WeighableLine } from "./recipeNutrition";

type LoadCtx = Pick<QueryCtx, "db">;

/** A line of the recipe: how much of what, already named in the caller's language. */
type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: RecipeUnit;
  /**
   * Shipped so that an edit which never reaches the model (`regenerateRecipe`) hands the line back
   * still tagged: the edit path rebuilds its lines from this payload, and a missing tag there would
   * be saved as "all of the oil is eaten". The screen does not read it.
   */
  fatUse?: FatUse;
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
  /**
   * What the catalog row knows about converting this ingredient, for the tile a cook taps to read
   * the line in another unit — 500 g of chicken as a third of one.
   *
   * The ratios themselves rather than the line already converted, because the client scales the
   * line to the servings chosen and a quantity converted here would be wrong the moment the stepper
   * moved. Grouped apart from `unit`, so the unit the line is written in and the one it converts
   * from are never side by side at the call site.
   */
  conversion: GramWeights & { defaultUnit: Unit };
};

/**
 * Who wrote the recipe, for the line that credits them: a named cook, or one who deleted their
 * account (`isAnonymous`, and no name). Absent on a recipe with no owner.
 */
type RecipeChef = (
  | { name: string; isAnonymous?: undefined }
  | { isAnonymous: true; name?: undefined }
) & {
  /**
   * What their avatar is drawn from, derived from `userId` — which itself still never ships.
   * Present for an anonymous author too: one deleted cook keeps one face across their recipes.
   *
   * Computed here rather than on the client, although the client could: the home header draws the
   * same face for the signed-in cook, and a second caller on a second release schedule is how the
   * two stop matching. See `shared/avatars.ts`.
   */
  seed: string;
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
   * The plate at its large size, for the header that spans the screen, beside the card's medium
   * `plateImageUrl`. Two fields rather than one, so a name never means a different file depending
   * on which payload it arrived in. Absent in the same cases as the card's.
   */
  plateImageLargeUrl?: string;
  /**
   * What the recipe adds up to, or nothing at all.
   *
   * Computed per read rather than stored: it is a reduce over the same catalog rows the lines were
   * just named from, and a column would have to be rewritten every time an ingredient's macros are
   * corrected. `totalsOf` refuses a partial total, and so does this — see `nutritionOfLines`.
   */
  nutrition?: RecipeNutrition;
  /**
   * Whether the reader wrote it, and whether they kept it — present only when a `viewer` was
   * given, which the client-facing `getOne.authed` does and internal callers do not.
   *
   * Reads are open to any signed-in cook (ADR 0014), so the screen can no longer take ownership
   * for granted: `isOwned` is what gates the pencil and the editor, and it is derived here rather
   * than shipped as `userId` so the payload still names nobody. `isFavorited` rides the same
   * payload rather than a second subscription — one round trip per screen open.
   */
  isOwned?: boolean;
  isFavorited?: boolean;
  /**
   * The page the recipe was imported from, for the link under it — only for a viewer who owns the
   * recipe or is an admin, and only when one was stored.
   *
   * Left out of the payload for everyone else rather than shipped beside a flag saying not to draw
   * it: a field the client receives is a field any cook can read off the wire.
   */
  sourceUrl?: string;
  /**
   * Whether its cook deleted it. Shipped because an archived recipe is still opened — from a meal
   * cooked with it — and the editor must not offer to delete it a second time.
   */
  isArchived: boolean;
};

/**
 * The recipe's lines as the page draws them, each named in the caller's locale, beside the
 * weighable lines the nutrition total is counted from.
 *
 * Both come out of one `loadRecipeLines` read: the page and the total need the very same catalog
 * rows, and fetching them twice for one page would double the reads to arrive at the same numbers.
 */
const _linesOf = async (
  ctx: LoadCtx,
  recipeId: Doc<"recipes">["_id"],
  locale: Locale,
): Promise<{ lines: RecipeIngredient[]; weighable: WeighableLine[]; lineCount: number }> => {
  const { lines: weighable, lineCount } = await loadRecipeLines(ctx, recipeId);

  const lines = await Promise.all(
    weighable.map(async ({ ingredient, quantity, unit, fatUse }) => {
      /** Skipped entirely for a row with no photo, which is most of the catalog today. */
      const image = ingredient.imageId ? await getImage(ctx, ingredient.imageId) : null;

      return {
        name: resolvei18n(ingredient.name, locale),
        quantity,
        unit,
        ...(fatUse && { fatUse }),
        emoji: ingredient.emoji,
        imageUrl: image?.sizes.thumbnail.url,
        category: ingredient.category,
        conversion: {
          defaultUnit: ingredient.defaultUnit,
          gramsPerPiece: ingredient.gramsPerPiece,
          gramsPerSlice: ingredient.gramsPerSlice,
          gramsPerMl: ingredient.gramsPerMl,
        },
      };
    }),
  );

  return { lines, weighable, lineCount };
};

/**
 * Who to credit, from the recipe's owner.
 *
 * Absent rather than a placeholder name in both of the cases that reach it: a recipe with no
 * `userId` — a seeded one — and a user row carrying no name. The screen decides what an uncredited
 * recipe looks like; inventing "Anonymous" here would put one language into the payload and take
 * that decision away from it.
 *
 * A deleted author is the third case, and says so with `isAnonymous` rather than a name, for the same
 * reason. It cannot be read off the missing name, which a living password account lacks too: only
 * `usersExtended.deletedAt` says the account was anonymized. That row is read only when there is no
 * name, so a named author still costs one read.
 *
 * An erased account (`purgeUser` with `force`) leaves no user at all: its recipes are archived and
 * detached. Archived is what tells them from the catalog, which is never archived (archiving is the
 * owner's), so an archived recipe with no author is anonymous too, drawn with the anonymous face.
 */
const _chefOf = async (
  ctx: LoadCtx,
  { userId, isArchived }: Pick<Doc<"recipes">, "userId" | "isArchived">,
): Promise<RecipeChef | undefined> => {
  if (!userId) return isArchived ? { isAnonymous: true, seed: ANONYMOUS_AVATAR_SEED } : undefined;

  const user = await ctx.db.get(userId);
  if (user?.name) return { name: user.name, seed: avatarSeed(userId) };

  const extended = await ctx.db
    .query("usersExtended")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  return extended?.deletedAt !== undefined ? { isAnonymous: true, seed: avatarSeed(userId) } : undefined;
};

/**
 * The recipe itself, or where to find it.
 *
 * A caller that already holds the row — a mutation that just wrote it — passes the document and
 * spares a second read. A caller holding only an id — the router, an internal action, a scheduled
 * job — hands over the id and this fetches it.
 *
 * ⚠️ **Neither branch is an authorization check**, and the id branch is the one that can look like
 * one. A recipe is readable by any signed-in cook (ADR 0014), and what is NOT — editing, listing —
 * is gated where it happens, never here: `loadRecipe` will happily resolve any recipe in the table
 * for anybody who asks.
 */
type RecipeOrId = Doc<"recipes"> | Id<"recipes">;

/** Convex ids are branded strings, so the discriminant is the primitive type and nothing else. */
const _resolve = async (ctx: LoadCtx, target: RecipeOrId): Promise<Doc<"recipes">> => {
  if (typeof target !== "string") return target;

  const recipe = await ctx.db.get(target);
  if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "Recipe not found" });

  return recipe;
};

/** Who is reading, as far as the payload depends on it. `isAdmin` is the caller's to establish. */
type Viewer = { id: Id<"users">; isAdmin?: boolean };

/**
 * The reader's relation to the recipe, or nothing when nobody in particular is reading.
 *
 * One point read on `by_user_and_recipe`. `isOwned` compares against the stored `userId` here so
 * that the id itself never has to leave the server, and the same comparison decides `sourceUrl`.
 */
const _flagsOf = async (
  ctx: LoadCtx,
  recipe: Doc<"recipes">,
  viewer?: Viewer,
): Promise<Pick<RecipeDetail, "isOwned" | "isFavorited" | "sourceUrl">> => {
  if (!viewer) return {};

  const favorite = await ctx.db
    .query("recipeFavorites")
    .withIndex("by_user_and_recipe", (q) => q.eq("userId", viewer.id).eq("recipeId", recipe._id))
    .first();

  const isOwned = recipe.userId === viewer.id;
  const canSeeSource = isOwned || viewer.isAdmin;

  return {
    isOwned,
    isFavorited: favorite !== null,
    ...(canSeeSource && recipe.sourceUrl !== undefined && { sourceUrl: recipe.sourceUrl }),
  };
};

/**
 * One recipe, resolved into the language the caller is reading in.
 *
 * `instructions` arrives parsed rather than as the stored blob. The parser is `@shared/recipes`, so
 * either side could run it — doing it here means it runs once per fetch instead of once per render,
 * and the two screens that consume this both need the groups rather than the text.
 *
 * `viewer` is who is reading, when that matters: with it the payload carries `isOwned` and
 * `isFavorited`, and `sourceUrl` for the owner or an admin; without it, none of the three. It
 * gates what the payload shows, not whether the recipe can be read — see `_resolve`.
 */
export const loadRecipe = async (
  ctx: LoadCtx,
  { recipe: target, locale, viewer }: { recipe: RecipeOrId; locale: Locale; viewer?: Viewer },
): Promise<RecipeDetail> => {
  const recipe = await _resolve(ctx, target);

  const [{ lines, weighable, lineCount }, chef, cover, plate, flags, text] = await Promise.all([
    _linesOf(ctx, recipe._id, locale),
    _chefOf(ctx, recipe),
    coverOf(ctx, recipe),
    plateOf(ctx, recipe),
    _flagsOf(ctx, recipe, viewer),
    loadRecipeContent(ctx, recipe),
  ]);

  return {
    ...flags,
    ...toRecipeCard(recipe, locale, cover, plate),
    coverImageLargeUrl: cover?.sizes.large.url,
    plateImageLargeUrl: plate?.sizes.large.url,
    description: resolvei18n(text.description, locale),
    instructions: parseInstructions(resolvei18n(text.instructions, locale)),
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    equipments: recipe.equipments,
    tags: recipe.tags,
    timings: recipe.timings,
    ingredients: lines,
    nutrition: withCuiScore(nutritionOfLines(weighable, lineCount, recipe.servings), recipe._id),
    chef,
    isArchived: recipe.isArchived,
  };
};
