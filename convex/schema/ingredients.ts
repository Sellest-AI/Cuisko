import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vLocalized, vLocalizedList, vLocalizedText } from "./i18n";
import { INGREDIENT_SOURCES, RECIPE_UNITS, UNITS } from "@shared/ingredients";
import { NUTRI_SCORE_GRADES } from "@shared/nutrition";
import { DIETS } from "@shared/diets";
import { ALLERGENS } from "@shared/allergens";
import { CATEGORIES } from "@shared/categories";

/**
 * The category vocabulary as a validator. Exported for the reason `vUnit` below is: a payload
 * crossing a function boundary carries the same closed list this table stores, and a second
 * `v.union(...CATEGORIES.map(...))` written beside a router agrees with this one only until
 * somebody narrows one of them.
 */
export const vCategory = v.union(...CATEGORIES.map(v.literal));

/**
 * The unit vocabulary as a validator, exported because every cellar table and every cellar
 * router argument needs the same one. Six hand-written copies of `v.union(...UNITS.map(...))`
 * agree only for as long as nobody narrows one of them.
 */
export const vUnit = v.union(...UNITS.map(v.literal));

/**
 * The wider vocabulary a RECIPE line is written in — `UNITS` plus `slice`. For `recipeIngredients`
 * and the planning rows that keep a recipe's own words; never for a cellar or grocery row, which
 * hold what a shop sells, and never for `defaultUnit` below.
 */
export const vRecipeUnit = v.union(...RECIPE_UNITS.map(v.literal));
const vNutriScoreGrade = v.union(...NUTRI_SCORE_GRADES.map(v.literal));

/**
 * The strictest diet an ingredient is suitable for, as a validator.
 *
 * The vocabulary is `shared/`'s and not this file's, for the reason `vUnit` above is: `computeTags`
 * reduces over these values and `shared/tags.ts` maps them to tags, so a second list written here
 * would agree with that one only until somebody narrowed it.
 */
export const vDiet = v.union(...DIETS.map(v.literal));

/**
 * The allergen vocabulary as a validator — the fourteen EU-regulated substances (@shared/allergens).
 *
 * Literals on the document rather than ids into an `allergens` table, which is what this used to
 * be. The table existed so an allergen could be renamed and translated in one place; it cost a
 * join table, two cascade rules and a read per ingredient per lookup, and it bought nothing the
 * other closed vocabularies in this schema do not already get for free. `recipes.tags`,
 * `CATEGORIES` and `UNITS` are all literal unions for the same reason: the list is fixed by
 * something outside this app — here, EU regulation 1169/2011 — so an id adds indirection to a
 * value that will never change.
 *
 * What is given up is a `by_allergen` lookup: Convex has no indexable equality for array
 * membership, so "every ingredient containing gluten" is a scan. Nothing asks — the tags read the
 * array forward, off a document already in hand.
 */
export const vAllergen = v.union(...ALLERGENS.map(v.literal));

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
 * **Written only by `ingredientRow`**, from the two fields above, and composed by every writer of
 * this table — the seed and `createIngredient` alike (ADR 0011). Anything that sets `name` or
 * `aliases` without recomputing this leaves the row findable under its old spelling and not its
 * new one — a drift with no symptom except a search that quietly misses.
 */
const vSearchText = vLocalizedText;

export const vIngredientSource = v.union(...INGREDIENT_SOURCES.map(v.literal));

/**
 * The nine nutrients, per 100g, as the COLUMN holds them.
 *
 * Five are optional, for two different reasons. Four are about history, not about sources: rows
 * written before a nutrient was stored carry no value for it, and a row written today has no such
 * excuse — which is why the payload a writer hands over restates those four as required
 * (`vIngredientFacts` in `schema/ingredientPayloads.ts`). `iron` is the fifth and is optional all
 * the way down, because the SOURCE may genuinely not know it.
 *
 * Extracted from the table so the two are one statement plus its difference, rather than two lists
 * that agree until somebody adds a tenth nutrient.
 */
export const vIngredientNutrition = v.object({
  calories: v.number(),
  protein: v.number(),
  fat: v.number(),
  saturatedFat: v.optional(v.number()),
  carbohydrates: v.number(),
  sugars: v.optional(v.number()),
  fiber: v.optional(v.number()),
  sodium: v.optional(v.number()),
  /**
   * mg per 100g. Optional for a reason the other four are not: the SOURCE may not know it. CIQUAL
   * leaves iron unmeasured on 27 of the 491 catalog foods, and `vNutritionFacts` therefore leaves
   * it optional too rather than promoting it the way it promotes the Nutri-Score inputs — a writer
   * who does not know a food's iron must be able to say so.
   */
  iron: v.optional(v.number()),
});

export const ingredients = defineTable({
  // Stable dedup key for the seed catalog (convex/functions/ingredients/ingredientCatalog.ts) —
  // lets re-running the seed upsert by identity instead of by name, which can legitimately repeat
  // across categories ("thyme" fresh vs. dried). Rows created outside the seed leave it unset.
  slug: v.optional(v.string()),
  name: vLocalized,

  // The emoji and image the catalog shows for this ingredient, and the image the app shows in a
  // recipe line. The seed always writes an emoji, and the image is generated on first enrichment.
  emoji: v.string(),
  imageId: v.optional(v.id("images")),

  aliases: v.optional(vAliases),
  search: v.optional(vSearchText),
  category: vCategory,

  /**
   * Which of the four sources this row's facts came from — see `INGREDIENT_SOURCES`.
   *
   * Optional only because rows written before this field existed do not carry one; every writer
   * sets it (`ingredientRow.ts`), so `undefined` means "seeded before we recorded this" and not
   * "unknown provenance". Slice 9 backfills those to `seed` and this becomes required.
   *
   * No index. Nothing queries by source — it is read off a document already in hand, by a screen
   * deciding how loudly to caveat a Nutri-Score.
   */
  source: v.optional(vIngredientSource),
  /**
   * Which diet this ingredient is suitable for — the field the `vegan` / `vegetarian` /
   * `pescatarian` tags are actually decided from.
   *
   * It exists because `category` cannot answer the question. A category proves what an ingredient
   * IS and is silent on what it is not: fish sauce is a `CONDIMENT`, honey a `SWEETENER`, gelatin
   * an `OTHER`, and a recipe tagged from categories alone calls a pad thai vegetarian. See
   * @shared/diets.
   *
   * Optional because a row can exist before anything has classified it — an ingredient a cook
   * imports themselves, before enrichment fills this in. **Absent means unknown, never
   * permissive**: `computeTags` drops all three diet tags from any recipe with a line it cannot
   * read this from, rather than assuming the plant answer. The seed always writes it, and throws
   * on a catalog row whose category cannot decide and which declares nothing.
   */
  diet: v.optional(vDiet),
  /**
   * Every allergen this ingredient is known to carry, of the fourteen.
   *
   * **`undefined` and `[]` are different answers, and the difference is the whole field.**
   * `undefined` is "nothing has classified this row" — a cook's own ingredient, before enrichment
   * runs against it or after that failed. `[]` is "classified, and it carries none of the
   * fourteen". They are the same shape and opposite meanings, and reading the first as the second
   * is a confident `nut-free` on a recipe nobody checked.
   *
   * That distinction is why this is an array on the document and not rows in a join table: an
   * absent join row and an empty one look identical from here, so the join-table version needed a
   * second `allergensCheckedAt` column to carry what `undefined` says on its own.
   *
   * `computeTags` therefore withholds all three free-from tags from any recipe with one
   * unclassified line, rather than answering from the lines that were.
   */
  allergens: v.optional(v.array(vAllergen)),
  defaultUnit: vUnit,
  defaultQuantity: v.number(),
  /**
   * What one of this ingredient weighs, for the units that do not carry a weight themselves.
   *
   * `nutrition` below is per 100g, so every quantity has to reach grams before it can be counted —
   * and "2 onions" or "1 tbsp of oil" cannot get there on arithmetic alone. **Every weight is AS
   * SOLD**, bone and shell included, because the shopping list buys the whole thing; `edibleShare`
   * below is what takes nutrition down to the part that is eaten. `gramsPerPiece` weighs a single
   * one (150 for an onion, 250 for a baguette, 250 for a bone-in chicken leg); `gramsPerMl` is the
   * density, and it is the difference between oil at 0.91 and honey at 1.42 — assuming 1.0
   * understates honey by 40%. `gramsPerSlice` weighs one slice of something sold whole and eaten cut (35 for a slice of
   * that baguette): a recipe counts slices, the shop sells the loaf, and one ratio cannot answer
   * both. How many slices make a loaf is derived from the two weights, never stored.
   *
   * All three stay optional permanently, and not merely until the catalog is reseeded: an
   * ingredient carries the ratios for the units it is plausibly measured in, which is usually one
   * of them. A chicken has no `gramsPerMl` because nobody measures one in millilitres, flour has no
   * `gramsPerPiece` because there is no such thing as one flour, and an onion has no
   * `gramsPerSlice` because nobody counts onion slices. Absent here means "no such question", not
   * "not filled in yet".
   *
   * What is not expressible as a validator, and belongs in the seed instead: an ingredient must
   * carry the ratio for its own `defaultUnit`, or the unit it is most often written in is the one
   * quantity nothing can weigh. A recipe with a line this cannot convert reports no nutrition at
   * all rather than a partial total — a dish quietly missing its olive oil reads as a health food.
   */
  gramsPerPiece: v.optional(v.number()),
  gramsPerSlice: v.optional(v.number()),
  gramsPerMl: v.optional(v.number()),
  /**
   * The share of the as-sold weight that is eaten, in (0, 1]: 0.4 for mussels in their shells, 0.7
   * for a bone-in chicken thigh. **Absent is 1**, the whole of it, which is every row whose waste is
   * too small to count or is not bought with it.
   *
   * `nutrition` is per 100 g of the edible part and every weight above is as sold, so a line's grams
   * are multiplied by this before they are counted (`edibleGrams` in shared/ingredients.ts) and by
   * nothing else: shopping, stock and the grocery conversion keep buying the shells. It applies in
   * every unit, grams included, because "1 kg de moules" is bought in the shell too.
   *
   * Not validated here, because a validator cannot say "(0, 1]". The seed's catalog test checks the
   * catalog, and the sanitizer drops a model's out-of-range answer before it reaches a row.
   */
  edibleShare: v.optional(v.number()),
  /**
   * How many days this keeps in the form a shop usually sells it, unopened and stored the normal
   * way — the rough date a cellar row is given when it is bought (`addToCellar`).
   *
   * **The form a shop sells, not the one a recipe names.** Concassé de tomates is 365, because it
   * is bought in a tin; milk is 90, because it is bought as a UHT carton; dried pasta is 730. The
   * short end of the real range, from public references, and not shortened further: a date that
   * comes too early pushes a meal up the week for food that was fine.
   *
   * `openedShelfLifeDays` is the same question once the pack is opened or the vegetable cut — 3 for
   * that UHT milk, 5 for the concassé, 2 for a cut tomato. **Never more than `shelfLifeDays`**:
   * opening something never makes it keep longer. The seed test checks it for the catalog, and the
   * agent's answer is clamped to it. Stored now, read by nothing yet: marking a cellar row opened
   * when a meal only uses part of it is its own slice.
   *
   * Both are rough, and are only ever used to decide what to cook first. Optional because a row can
   * exist before anything has estimated them; a cellar row bought without one has no date, which
   * the planner reads as "not urgent".
   */
  shelfLifeDays: v.optional(v.number()),
  openedShelfLifeDays: v.optional(v.number()),
  /**
   * All facts per 100 g of the RAW, EDIBLE part.
   *
   * **Raw**, because a recipe line is a raw weight: cooking drives out water, not calories, so a
   * cooked figure times a raw weight counts the same energy again (cooked mussels are 172 kcal per
   * 100 g, raw 86). A reference listing a food several times is read at its raw entry.
   * **Edible**, because `edibleShare` above takes the bone and shell out of the weight first.
   */
  nutrition: vIngredientNutrition,
  // Derived from `nutrition` by @shared/nutrition — absent until every field it needs is present.
  nutriScore: v.optional(v.object({
    grade: vNutriScoreGrade,
    points: v.number(),
  })),
  updatedAt: v.number(), // S5
})
  .index("by_slug", ["slug"])
  // Answers "which ingredients point at this image", which is what detaches them when the image
  // is deleted (CASCADE.images in functions/cascade.ts). Nothing reads it on a normal path.
  .index("by_image", ["imageId"])
  // Over `search.*` rather than `name.values.*`, so a synonym finds its ingredient too.
  .searchIndex("search_en", { searchField: "search.en" })
  .searchIndex("search_fr", { searchField: "search.fr" });
