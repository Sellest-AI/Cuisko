import { foldAccents } from "@shared/translations";
import type { Category } from "@convex/schema/ingredients";
import type { MutationCtx } from "@convex/procedures";
import { hashText, setTranslation } from "@convex/lib/i18n";
import { computeNutriScore } from "@shared/nutrition";
import { CATALOG } from "./ingredientCatalog";

/**
 * The share of an ingredient, by weight, that is fruit/vegetable/legume — the one Nutri-Score
 * input the catalog does not measure per ingredient (see shared/nutrition.ts). Estimated from
 * `category` since these are single, unprocessed ingredients rather than mixed products.
 */
const FRUIT_VEG_LEGUME_PERCENT: Partial<Record<Category, number>> = {
  VEGETABLE: 100,
  FRUIT: 100,
  HERB: 100,
  LEGUME: 50,
};

/**
 * The string one locale's search index reads: the name and every alias, plus an accent-stripped
 * copy of each, de-duplicated.
 *
 * Both forms are indexed because the shopper types on a phone keyboard in a supermarket. "creme"
 * has to find "crème" and "pates" has to find "pâtes"; indexing only the accented spelling makes
 * the correct answer unreachable to anyone who does not stop to long-press a vowel.
 *
 * De-duplicated so an unaccented name is not stored twice — the index gains nothing from the
 * repeat, and a term's frequency is what ranking is built on.
 */
const _searchText = (name: string, aliases: string[] = []) => {
  const terms = [name, ...aliases];
  // The same fold the navigation bar applies to what the shopper types. It has to be the same
  // one: this writes the string the search index matches, and that one scores against it.
  const folded = terms.map(foldAccents);

  return [...new Set([...terms, ...folded])].join(" ");
};

/**
 * Inserts or updates the starter ingredient catalog. Idempotent: matches existing rows by
 * `slug`, so re-running after editing `ingredientCatalog.ts` updates them in place instead of
 * duplicating the table.
 */
export const seedIngredients = async (ctx: MutationCtx) => {
  let created = 0;
  let updated = 0;

  for (const entry of CATALOG) {
    const nutriScore = computeNutriScore(
      entry.nutrition,
      FRUIT_VEG_LEGUME_PERCENT[entry.category] ?? 0,
    );

    const en = setTranslation({ values: {}, meta: {} }, "en", entry.en, "edited", hashText(entry.en));
    const name = setTranslation(en, "fr", entry.fr, "edited", hashText(entry.fr));

    const existing = await ctx.db
      .query("ingredients")
      .withIndex("by_slug", (q) => q.eq("slug", entry.slug))
      .unique();

    const row = {
      slug: entry.slug,
      name,
      emoji: entry.emoji,
      aliases: entry.aliases,
      // Derived here and nowhere else — see `search` in schema/ingredients.ts.
      search: {
        en: _searchText(entry.en, entry.aliases.en),
        fr: _searchText(entry.fr, entry.aliases.fr),
      },
      category: entry.category,
      defaultUnit: entry.defaultUnit,
      defaultQuantity: entry.defaultQuantity,
      nutrition: entry.nutrition,
      nutriScore,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      updated++;
    } else {
      await ctx.db.insert("ingredients", row);
      created++;
    }
  }

  return { created, updated, total: CATALOG.length };
};
