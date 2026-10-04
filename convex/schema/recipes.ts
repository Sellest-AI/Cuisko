import { defineTable } from "convex/server";
import { vLocalized, vLocalizedText } from "./i18n";
import { v } from "convex/values";
import { vFatUse, vRecipeUnit } from "./ingredients";
import { vEquipments } from "./cellars";
import { DIFFICULTY_LEVELS } from "@shared/recipes";
import { CUISINES } from "@shared/cuisines";
import { TAGS } from "@shared/tags";

/**
 * The fields every search index on `recipes` can filter by, written once because all four must
 * agree — see the comment on the indexes below.
 *
 * Ten of the sixteen a Convex search index allows, leaving room for the authored facets a filter
 * row will eventually want (`isQuick`, `isOnePot`) without a schema migration.
 */
const FACET_FIELDS = [
  "isVegan",
  "isVegetarian",
  "isPescatarian",
  "isGlutenFree",
  "isDairyFree",
  "isNutFree",
  "cuisine",
  "difficulty",
  "userId",
  "isArchived",
] as const;

export const RECIPE_STATUSES = ["generated", "reviewed"] as const;

export const vRecipeStatus = v.union(...RECIPE_STATUSES.map(v.literal));

export const recipes = defineTable({
  title: vLocalized,
  description: vLocalized,
  instructions: vLocalized,
  servings: v.number(),
  equipments: vEquipments,
  difficulty: v.union(...DIFFICULTY_LEVELS.map(v.literal)),
  userId: v.optional(v.id("users")),
  /**
   * A random ordering key used to sample recipes without exposing other users' rows.
   * Optional only while the backfill migration brings existing recipes up to date.
   */
  shuffleKey: v.optional(v.number()),
  /**
   * Closed vocabularies rather than free strings, and for one reason: the model that fills these
   * in speaks a single locale per run, so free text would store "italienne" from a French cook and
   * "Italian" from an English one — two recipes of the same cuisine that never group or filter
   * together, with no symptom until the app holds both locales. The stored value is locale-free;
   * the word on screen is a translation key. `tags` has that plus an unbounded range, which no
   * filter UI can be built against. See @shared/cuisines and @shared/tags.
   */
  tags: v.array(v.union(...TAGS.map(v.literal))),
  cuisine: v.union(...CUISINES.map(v.literal)),
  timings: v.object({
    preparation: v.optional(v.number()),
    cooking: v.optional(v.number()),
    resting: v.optional(v.number()),
  }),
  /**
   * Every ingredient of this recipe as one searchable string per locale — names, their catalog
   * aliases, and an accent-folded copy of each.
   *
   * Deliberately holds NO recipe-authored text. The title has its own index below, and keeping the
   * two apart is what preserves each term's weight: BM25 divides a term's score by the length of
   * the field it sits in, so a three-word title folded into an eighty-token ingredient blob would
   * score as though it were barely there. Two fields, two indexes, two queries if a screen ever
   * wants both.
   *
   * It also buys something bigger, and by accident: because nothing here is written by the model,
   * this field does not change when a translation lands. `saveTranslations` is not a writer of it,
   * and a derived field with one writer is a derived field that cannot drift out of step with a
   * second one.
   *
   * Written ONLY through `searchTextOf` (ADR 0011), and required: a recipe with no blob is one no
   * search can reach, so there is no sensible row without it. A recipe whose every line is unknown
   * still gets a blob — an empty string per locale, which matches nothing and claims nothing.
   * Anything assembling this string itself indexes the row under a spelling the reader never
   * searches for, with no symptom except a recipe that is never found.
   */
  search: vLocalizedText,
  /**
   * The six claims from `tags`, as booleans a search index can filter on exactly.
   *
   * `tags` is a `v.array` and Convex has no indexable equality for array membership, so the array
   * can be rendered and cannot be filtered. These are its filterable projection, computed by
   * `facetsOf` from the finished tag list so the two cannot disagree.
   *
   * **They are `filterFields`, never search terms, and that is the whole point.** A search
   * expression matches ANY of its terms and ranks the rest, so `search("pepper vegan")` returns
   * pork stews — ranked lower, but returned. A `filterField` narrows the candidate set INSIDE the
   * index scan, before the 1024-result budget is spent. A diet is a promise, and a promise cannot
   * be kept by a relevance score the vendor documents as "subject to change".
   *
   * Required, because there is nothing for a third state to mean. `false` already says NOT CLAIMED
   * — the recipe does not surface under a filter that promises the claim — and it never says
   * "contains gluten". An `undefined` beside it would be the same sentence written twice, which is
   * the shape somebody eventually reads as a distinction.
   *
   * That is the difference from `ingredients.diet` and `ingredients.allergens`, which ARE optional:
   * there, absent means nobody has classified the row yet, and it is genuinely a third answer.
   * These are computed from `tags` at the moment the recipe is written, so a recipe that exists has
   * been asked the question.
   */
  isVegan: v.boolean(),
  isVegetarian: v.boolean(),
  isPescatarian: v.boolean(),
  isGlutenFree: v.boolean(),
  isDairyFree: v.boolean(),
  isNutFree: v.boolean(),

  // Images
  coverImageId: v.optional(v.id("images")),
  plateImageId: v.optional(v.id("images")),

  /**
   * The web page this recipe was imported from, in the ONE spelling `canonicalUrlOf` produces —
   * trackers and fragment stripped — and absent on a recipe typed by hand.
   *
   * Locale-free metadata with a single writer, `saveRecipe`: the agent never sees it and the
   * translation path never touches it, so it cannot drift out of step with anything. Nothing
   * displays it yet; it is the fact attribution, re-import and dedupe will stand on.
   */
  sourceUrl: v.optional(v.string()),

  /**
   * Whether a person has been through what the model wrote. Every recipe starts `generated` — a
   * typed one too, since the model fills in its tags, cuisine and timings — and becomes `reviewed`
   * the first time its cook saves an edit (`updateRecipe`). Nothing is gated on it yet; `by_status`
   * is what a review queue will read.
   */
  status: vRecipeStatus,
  /**
   * A deleted recipe, kept. Deleting cannot remove the row: planned and cooked meals point at it,
   * and a cook opening last week's dinner must still find the recipe. So it leaves every surface a
   * recipe is CHOSEN from — the cook's list, search, favorites, planning — and stays readable by id.
   *
   * A boolean beside `status` rather than a third value of it, for the index: a Convex index reads
   * equality on a prefix, so "generated OR reviewed" would be two reads, and a paginated list cannot
   * be one page of two reads. It also keeps a reviewed recipe's review when it is archived.
   *
   * Required because every list read asks `eq("isArchived", false)`, and an absent field does not
   * equal `false`: a row without it would be live and on no list.
   */
  isArchived: v.boolean(),

  updatedAt: v.number(), // S5
})
  .index("by_user", ["userId"])
  // The cook's live recipes, newest first: the recipes page (`listForUser`).
  .index("by_user_and_is_archived", ["userId", "isArchived"])
  // A random window of one owner's live recipes: the planning pool (`candidatePool`).
  .index("by_user_and_is_archived_and_shuffle_key", ["userId", "isArchived", "shuffleKey"])
  // "Which recipe of this cook already came from this page" — the dedupe / re-import question.
  // No query reads it yet; it is declared with the column so the answer is indexed from day one.
  .index("by_user_and_source_url", ["userId", "sourceUrl"])
  // "Does any cook have a live recipe from this video": a share of a reel someone already imported
  // returns that recipe instead of paying for it again (`importVideo`, `findBySource`). Live rows
  // only, so a video whose every import was deleted is imported afresh (ADR 0017).
  .index("by_is_archived_and_source_url", ["isArchived", "sourceUrl"])
  .index("by_difficulty", ["difficulty"])
  // "Which recipes has nobody checked yet" — the review queue. Nothing reads it yet; declared with
  // the column, like `by_user_and_source_url`, so the answer is indexed from day one.
  .index("by_status", ["status"])
  // Answer "which recipe points at this image", which is what detaches it when the image is deleted
  // (CASCADE.images in functions/cascade.ts). Nothing reads them on a normal path.
  .index("by_cover_image", ["coverImageId"])
  .index("by_plate_image", ["plateImageId"])
  // All four indexes carry the same filter fields: a cook who is vegan is vegan whether they are
  // searching by ingredient or by title, in French or in English, so a facet missing from one of
  // them is a promise the app keeps on one screen and breaks on another.
  .searchIndex("search_en", { searchField: "search.en", filterFields: [...FACET_FIELDS] })
  .searchIndex("search_fr", { searchField: "search.fr", filterFields: [...FACET_FIELDS] })
  .searchIndex("search_title_en", { searchField: "title.values.en", filterFields: [...FACET_FIELDS] })
  .searchIndex("search_title_fr", { searchField: "title.values.fr", filterFields: [...FACET_FIELDS] });

export const recipeIngredients = defineTable({
  recipeId: v.id("recipes"),
  ingredientId: v.id("ingredients"),
  position: v.number(),
  quantity: v.number(),
  unit: vRecipeUnit,
  /**
   * Set only on a cooking fat that is partly left in the pan or the fryer; absent means all of it
   * is eaten. Read by nutrition alone, through `nutritionOfLines`, which the figures and the tags
   * both count with — the cook still buys and pours the whole quantity.
   */
  fatUse: v.optional(vFatUse),
  updatedAt: v.number(), // S5
})
  .index("by_recipe", ["recipeId"])
  .index("by_ingredient", ["ingredientId"]);


/**
 * A cook's private shelf: one row per recipe they favorited, whoever wrote it.
 *
 * A join table, so no `updatedAt` (S5b) and no `position` — the shelf is ordered by
 * `_creationTime`, newest favorite first. Nothing counts these rows and no surface shows another
 * cook's: favorites are curation, not a feed (PRODUCT.md anti-goal #3).
 */
export const recipeFavorites = defineTable({
  recipeId: v.id("recipes"),
  userId: v.id("users"),
})
  .index("by_user", ["userId"])
  .index("by_recipe", ["recipeId"])
  /** The point read both hot paths make: "has this cook favorited this recipe?" */
  .index("by_user_and_recipe", ["userId", "recipeId"]);
