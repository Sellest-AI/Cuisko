import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vLocalized, vLocalizedList, vLocalizedText } from "./i18n";
import { UNITS } from "@shared/ingredients";
import { NUTRI_SCORE_GRADES } from "@shared/nutrition";

export const CATEGORIES = [
  "VEGETABLE",
  "FRUIT",
  "GRAIN",
  "MEAT",
  "SEAFOOD",
  "DAIRY",
  "EGG",
  "LEGUME",
  "NUT",
  "SEED",
  "HERB",
  "SPICE",
  "OIL",
  "CONDIMENT",
  "SWEETENER",
  "OTHER",
] as const;

export type Category = (typeof CATEGORIES)[number];
const vCategory = v.union(...CATEGORIES.map(v.literal));

/**
 * The unit vocabulary as a validator, exported because every cellar table and every cellar
 * router argument needs the same one. Six hand-written copies of `v.union(...UNITS.map(...))`
 * agree only for as long as nobody narrows one of them.
 */
export const vUnit = v.union(...UNITS.map(v.literal));
const vNutriScoreGrade = v.union(...NUTRI_SCORE_GRADES.map(v.literal));

/**
 * The other ways to say an ingredient — "patates" for pommes de terre.
 *
 * Deliberately not `vLocalized`: these are alternate spellings of the same word in one language,
 * not one meaning rendered in several, so there is nothing to translate and no `status` /
 * `sourceHash` to carry. A locale with no synonyms worth listing simply has none.
 */
const vAliases = vLocalizedList;

/**
 * `name` and `aliases` flattened into one string per locale — the field the search indexes read,
 * and the only denormalized field on this table.
 *
 * A Convex `searchIndex` takes exactly one `searchField`, and it must be a string. So an array of
 * aliases cannot be searched: matching them would otherwise mean a second index and a second query
 * merged in the client. One blob per locale is one index and one query, and it is what makes
 * "patates" reach pommes de terre server-side.
 *
 * **Written only by `seedIngredients`**, from the two fields above. Anything that sets `name` or
 * `aliases` without recomputing this leaves the row findable under its old spelling and not its
 * new one — a drift with no symptom except a search that quietly misses.
 */
const vSearchText = vLocalizedText;

export const ingredients = defineTable({
  // Stable dedup key for the seed catalog (convex/functions/ingredients/ingredientCatalog.ts) —
  // lets re-running the seed upsert by identity instead of by name, which can legitimately repeat
  // across categories ("thyme" fresh vs. dried). Rows created outside the seed leave it unset.
  slug: v.optional(v.string()),
  name: vLocalized,
  /**
   * Stands in for the produce photo every card will eventually draw. Optional only until every
   * seeded row has one — the seed always writes it, falling back to the category's emoji, so it is
   * absent solely on rows created before this field existed. Flip to required once reseeded.
   */
  emoji: v.optional(v.string()),
  aliases: v.optional(vAliases),
  search: v.optional(vSearchText),
  category: vCategory,
  defaultUnit: vUnit,
  defaultQuantity: v.number(),
  /**
   * What one of this ingredient weighs, for the units that do not carry a weight themselves.
   *
   * `nutrition` below is per 100g, so every quantity has to reach grams before it can be counted —
   * and "2 onions" or "1 cs of oil" cannot get there on arithmetic alone. `gramsPerPiece` weighs a
   * single one (150 for an onion); `gramsPerMl` is the density, and it is the difference between
   * oil at 0.91 and honey at 1.42 — assuming 1.0 understates honey by 40%.
   *
   * Both stay optional permanently, and not merely until the catalog is reseeded: an ingredient
   * carries the ratios for the units it is plausibly measured in, which is usually one of the two.
   * A chicken has no `gramsPerMl` because nobody measures one in millilitres, and flour has no
   * `gramsPerPiece` because there is no such thing as one flour. Absent here means "no such
   * question", not "not filled in yet".
   *
   * What is not expressible as a validator, and belongs in the seed instead: an ingredient must
   * carry the ratio for its own `defaultUnit`, or the unit it is most often written in is the one
   * quantity nothing can weigh. A recipe with a line this cannot convert reports no nutrition at
   * all rather than a partial total — a dish quietly missing its olive oil reads as a health food.
   */
  gramsPerPiece: v.optional(v.number()),
  gramsPerMl: v.optional(v.number()),
  // All facts per 100g.
  nutrition: v.object({
    calories: v.number(),
    protein: v.number(),
    fat: v.number(),
    saturatedFat: v.optional(v.number()),
    carbohydrates: v.number(),
    sugars: v.optional(v.number()),
    fiber: v.optional(v.number()),
    sodium: v.optional(v.number()),
  }),
  // Derived from `nutrition` by @shared/nutrition — absent until every field it needs is present.
  nutriScore: v.optional(v.object({
    grade: vNutriScoreGrade,
    points: v.number(),
  })),
  updatedAt: v.number(), // S5
})
  .index("by_slug", ["slug"])
  // Over `search.*` rather than `name.values.*`, so a synonym finds its ingredient too.
  .searchIndex("search_en", { searchField: "search.en" })
  .searchIndex("search_fr", { searchField: "search.fr" });

export const allergens = defineTable({
  name: vLocalized,
  updatedAt: v.number(), // S5
})
  .searchIndex("search_name_en", { searchField: "name.values.en" })
  .searchIndex("search_name_fr", { searchField: "name.values.fr" });

/**
 * Which ingredients carry which allergens.
 *
 * A join table rather than an `allergenIds` array on the ingredient, even though nothing queries
 * it in reverse today. An array of `v.id()` cannot be cascaded: Convex has no indexable equality
 * for array membership, so deleting an allergen would mean scanning every ingredient — which ADR
 * 0007 forbids, and rightly, since the catalog is the table most likely to grow.
 *
 * No `position`: an ingredient's allergens are a set, and nothing renders them in an order the
 * author chose.
 *
 * No `updatedAt` (S5b): a pair is asserted or retracted, never edited — there is nothing on the row
 * but the two ids, so the field would record the moment of an insert and never change again.
 */
export const ingredientAllergens = defineTable({
  ingredientId: v.id("ingredients"),
  allergenId: v.id("allergens"),
})
  .index("by_ingredient", ["ingredientId"])
  .index("by_allergen", ["allergenId"])
  .index("by_ingredient_and_allergen", ["ingredientId", "allergenId"]);
